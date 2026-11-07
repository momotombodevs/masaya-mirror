//! Starting a mirror session: push the server, launch it, connect its sockets and hand back the
//! streams. Ports `ScrcpyService.startMirror` and `mirror-tango.ts`.

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tokio::io::{AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::tcp::{OwnedReadHalf, OwnedWriteHalf};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, watch};
use tokio::task::JoinHandle;

use super::control::{read_device_message, ControlMessage, DeviceMessage, EncodeError};
use super::options::{launch_command, socket_name, MirrorOptions, SERVER_REMOTE_PATH};
use super::stream::{
    read_audio_header, read_packet, read_video_header, AudioCodec, AudioHeader, MediaPacket,
    VideoCodecId,
};
use crate::adb::protocol::{AdbServer, DEFAULT_FILE_MODE};
use crate::error::AdbError;
use crate::i18n::{Locale, Msg};

/// Control messages queued beyond which pointer moves are dropped instead of queued.
pub const MAX_PENDING_CONTROLS: usize = 64;
/// How many lines of the server's output are kept to explain a failure.
const SERVER_OUTPUT_LINES: usize = 100;
/// How long the server may take to send a stream's header once every socket is open.
const HEADER_TIMEOUT: Duration = Duration::from_secs(10);
/// A socket that closes often does so just before the server process ends: how long to wait
/// for that end, so the user sees the server's last words rather than an end of file.
const EXIT_GRACE: Duration = Duration::from_millis(500);

#[derive(Debug, Clone, Copy)]
pub struct StartConfig {
    /// How many times to try connecting while the server is still starting.
    pub connect_attempts: u32,
    pub connect_delay: Duration,
    /// The session id. Random when `None`.
    pub scid: Option<u32>,
}

impl Default for StartConfig {
    fn default() -> Self {
        Self {
            connect_attempts: 100,
            connect_delay: Duration::from_millis(100),
            scid: None,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SessionError {
    /// `scrcpy-server.jar` is not where it should be.
    #[error("scrcpy-server missing at {0}")]
    ServerMissing(PathBuf),
    /// The server process ended before the sockets were connected.
    #[error("scrcpy server exited prematurely")]
    ServerExited { output: Vec<String> },
    #[error("could not connect to the scrcpy server")]
    ConnectFailed,
    #[error(transparent)]
    Adb(#[from] AdbError),
}

impl SessionError {
    pub fn user_message(&self, locale: Locale) -> String {
        match self {
            Self::ServerMissing(path) => Msg::ScrcpyMissing(&path.to_string_lossy()).text(locale),
            Self::ServerExited { output } => {
                match output.iter().rev().find(|line| !line.trim().is_empty()) {
                    Some(line) => format!("scrcpy server exited prematurely: {}", line.trim()),
                    None => "scrcpy server exited prematurely".to_owned(),
                }
            }
            Self::ConnectFailed => Msg::MirrorStartFailed.text(locale),
            Self::Adb(error) => error.user_message(locale),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct VideoInfo {
    pub device_name: Option<String>,
    pub codec: VideoCodecId,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AudioInfo {
    pub codec: AudioCodec,
}

/// Reads packets off one of the media sockets.
pub struct PacketReader {
    inner: BufReader<OwnedReadHalf>,
    /// Never written, only kept: dropping a write half shuts the socket down for writing, adb
    /// then closes the device's end and the server stops streaming.
    _write: OwnedWriteHalf,
}

impl PacketReader {
    /// The next packet, or `None` when the device closed the stream.
    pub async fn next(&mut self) -> Result<Option<MediaPacket>, AdbError> {
        read_packet(&mut self.inner).await
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SendOutcome {
    Sent,
    /// A pointer move dropped because the device is behind; the next one supersedes it.
    Dropped,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum ControlError {
    #[error(transparent)]
    Encode(#[from] EncodeError),
    #[error("the control connection is closed")]
    Closed,
}

/// Sends control messages to the phone in the order they arrive.
#[derive(Debug, Clone)]
pub struct ControlHandle {
    tx: mpsc::Sender<Vec<u8>>,
    dropped_moves: Arc<AtomicU64>,
}

impl ControlHandle {
    fn from_sender(tx: mpsc::Sender<Vec<u8>>) -> Self {
        Self {
            tx,
            dropped_moves: Arc::new(AtomicU64::new(0)),
        }
    }

    /// Pointer moves are dropped when [`MAX_PENDING_CONTROLS`] messages already wait, so a slow
    /// device cannot build an unbounded backlog. Presses, releases and typing always wait their turn.
    pub async fn send(&self, message: &ControlMessage) -> Result<SendOutcome, ControlError> {
        let bytes = message.encode()?;
        if message.is_touch_move() {
            return match self.tx.try_send(bytes) {
                Ok(()) => Ok(SendOutcome::Sent),
                Err(mpsc::error::TrySendError::Full(_)) => {
                    self.dropped_moves.fetch_add(1, Ordering::Relaxed);
                    Ok(SendOutcome::Dropped)
                }
                Err(mpsc::error::TrySendError::Closed(_)) => Err(ControlError::Closed),
            };
        }
        self.tx
            .send(bytes)
            .await
            .map_err(|_| ControlError::Closed)?;
        Ok(SendOutcome::Sent)
    }

    /// How many pointer moves were dropped because the device was behind.
    pub fn dropped_moves(&self) -> u64 {
        self.dropped_moves.load(Ordering::Relaxed)
    }
}

pub struct ScrcpySession {
    pub video: VideoInfo,
    pub audio: Option<AudioInfo>,
    video_reader: Option<PacketReader>,
    audio_reader: Option<PacketReader>,
    control: ControlHandle,
    clipboard: Option<mpsc::UnboundedReceiver<String>>,
    server_output: Arc<Mutex<VecDeque<String>>>,
    server_exited: watch::Receiver<bool>,
    tasks: Vec<JoinHandle<()>>,
}

impl ScrcpySession {
    /// Pushes the server, starts it and connects video, audio (if asked) and control.
    pub async fn start(
        adb: &AdbServer,
        serial: &str,
        server_jar: &Path,
        options: &MirrorOptions,
        config: StartConfig,
    ) -> Result<Self, SessionError> {
        let jar = tokio::fs::read(server_jar)
            .await
            .map_err(|_| SessionError::ServerMissing(server_jar.to_path_buf()))?;
        let mtime = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |elapsed| elapsed.as_secs() as u32);
        adb.push(serial, SERVER_REMOTE_PATH, &jar, DEFAULT_FILE_MODE, mtime)
            .await?;

        let scid = config.scid.unwrap_or_else(random_scid);
        let socket = socket_name(scid);
        let shell = adb
            .shell_stream(serial, &launch_command(scid, options))
            .await?;

        // The drain task owns the shell connection: aborting it closes the shell, which stops the
        // server. A failed start therefore aborts it; a successful one hands it to the session.
        let server_output = Arc::new(Mutex::new(VecDeque::new()));
        let (exited_tx, exited_rx) = watch::channel(false);
        // Also aborted when this future is dropped mid-connect (the user went back): no shell,
        // and so no server, is left behind on the phone.
        let drain = AbortOnDrop(Some(spawn_output_drain(
            shell,
            server_output.clone(),
            exited_tx,
        )));

        match Self::connect(adb, serial, &socket, options, config, &exited_rx).await {
            Ok(connected) => {
                let mut tasks = drain.disarm().into_iter().collect::<Vec<_>>();
                tasks.extend(connected.tasks);
                Ok(Self {
                    video: connected.video,
                    audio: connected.audio,
                    video_reader: Some(connected.video_reader),
                    audio_reader: connected.audio_reader,
                    control: connected.control,
                    clipboard: Some(connected.clipboard),
                    server_output,
                    server_exited: exited_rx,
                    tasks,
                })
            }
            Err(error) => {
                drop(drain);
                // A server that died explains the failure better than the connection error does.
                let died = matches!(error, SessionError::ConnectFailed | SessionError::Adb(_))
                    && *exited_rx.borrow();
                Err(if died {
                    SessionError::ServerExited {
                        output: snapshot(&server_output),
                    }
                } else {
                    error
                })
            }
        }
    }

    async fn connect(
        adb: &AdbServer,
        serial: &str,
        socket: &str,
        options: &MirrorOptions,
        config: StartConfig,
        exited: &watch::Receiver<bool>,
    ) -> Result<Connected, SessionError> {
        // The server accepts the sockets in a fixed order: video, audio, control. The first one
        // carries a dummy byte, so the client knows the server is really listening. It sends the
        // device name and the codec headers only once all of them are open, so every socket is
        // connected before any header is read (reading the video header first waits forever).
        let mut video = connect_socket(adb, serial, socket, config, exited, true).await?;
        let audio = if options.audio_enabled {
            Some(connect_socket(adb, serial, socket, config, exited, false).await?)
        } else {
            None
        };
        let control = connect_socket(adb, serial, socket, config, exited, false).await?;

        let header = read_header(read_video_header(&mut video, true), exited).await?;
        let mut audio_reader = None;
        let mut audio_info = None;
        if let Some(mut audio) = audio {
            if let AudioHeader::Codec(codec) =
                read_header(read_audio_header(&mut audio), exited).await?
            {
                audio_info = Some(AudioInfo { codec });
                audio_reader = Some(reader_of(audio));
            }
            // Disabled or errored: the phone cannot capture audio. Mirror without it.
        }

        let (control_read, control_write) = control.into_split();
        let (tx, rx) = mpsc::channel(MAX_PENDING_CONTROLS);
        let (clipboard_tx, clipboard) = mpsc::unbounded_channel();

        Ok(Connected {
            video: VideoInfo {
                device_name: header.device_name,
                codec: header.codec,
                width: header.width,
                height: header.height,
            },
            audio: audio_info,
            video_reader: reader_of(video),
            audio_reader,
            control: ControlHandle::from_sender(tx),
            clipboard,
            tasks: vec![
                tokio::spawn(write_controls(control_write, rx)),
                tokio::spawn(read_device_messages(control_read, clipboard_tx)),
            ],
        })
    }

    pub fn take_video(&mut self) -> Option<PacketReader> {
        self.video_reader.take()
    }

    pub fn take_audio(&mut self) -> Option<PacketReader> {
        self.audio_reader.take()
    }

    /// Text the phone copied, when clipboard sync is on.
    pub fn take_clipboard(&mut self) -> Option<mpsc::UnboundedReceiver<String>> {
        self.clipboard.take()
    }

    pub fn control(&self) -> ControlHandle {
        self.control.clone()
    }

    /// Turns `true` when the server process ends (the phone was unplugged, or the user quit).
    pub fn exited(&self) -> watch::Receiver<bool> {
        self.server_exited.clone()
    }

    pub fn server_output(&self) -> Vec<String> {
        snapshot(&self.server_output)
    }

    /// Stops the session: closes every socket, and with them the server.
    pub fn close(self) {
        drop(self);
    }
}

impl Drop for ScrcpySession {
    fn drop(&mut self) {
        for task in &self.tasks {
            task.abort();
        }
    }
}

struct Connected {
    video: VideoInfo,
    audio: Option<AudioInfo>,
    video_reader: PacketReader,
    audio_reader: Option<PacketReader>,
    control: ControlHandle,
    clipboard: mpsc::UnboundedReceiver<String>,
    tasks: Vec<JoinHandle<()>>,
}

fn reader_of(stream: TcpStream) -> PacketReader {
    let (read, write) = stream.into_split();
    PacketReader {
        inner: BufReader::with_capacity(256 * 1024, read),
        _write: write,
    }
}

fn snapshot(lines: &Mutex<VecDeque<String>>) -> Vec<String> {
    lines.lock().expect("output lock").iter().cloned().collect()
}

/// A random 31-bit session id, like the official client's.
fn random_scid() -> u32 {
    use std::hash::{BuildHasher, Hasher, RandomState};
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u128(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |d| d.as_nanos()),
    );
    (hasher.finish() as u32) & 0x7fff_ffff
}

/// Reads the server's output to the end, so its connection never blocks, and keeps the last
/// lines to explain a failure. Signals `exited` when the process ends.
fn spawn_output_drain(
    mut shell: TcpStream,
    lines: Arc<Mutex<VecDeque<String>>>,
    exited: watch::Sender<bool>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut pending = Vec::new();
        let mut buffer = [0u8; 4096];
        loop {
            let read = match shell.read(&mut buffer).await {
                Ok(0) | Err(_) => break,
                Ok(read) => read,
            };
            pending.extend_from_slice(&buffer[..read]);
            while let Some(newline) = pending.iter().position(|byte| *byte == b'\n') {
                let line: Vec<u8> = pending.drain(..=newline).collect();
                push_line(&lines, &line);
            }
        }
        if !pending.is_empty() {
            push_line(&lines, &pending);
        }
        let _ = exited.send(true);
    })
}

fn push_line(lines: &Mutex<VecDeque<String>>, raw: &[u8]) {
    let line = String::from_utf8_lossy(raw).trim_end().to_owned();
    let mut lines = lines.lock().expect("output lock");
    if lines.len() == SERVER_OUTPUT_LINES {
        lines.pop_front();
    }
    lines.push_back(line);
}

/// Connects to the server's abstract socket, retrying while it starts. With `expect_dummy`, the
/// connection only counts once the dummy byte arrives: adb accepts connections before the server
/// is listening, and then closes them.
/// Aborts a task when dropped, until [`AbortOnDrop::disarm`] hands it over.
struct AbortOnDrop(Option<JoinHandle<()>>);

impl AbortOnDrop {
    fn disarm(mut self) -> Option<JoinHandle<()>> {
        self.0.take()
    }
}

impl Drop for AbortOnDrop {
    fn drop(&mut self) {
        if let Some(task) = self.0.take() {
            task.abort();
        }
    }
}

/// Reads a stream's header, giving up after [`HEADER_TIMEOUT`] or when the server ends. A
/// failure waits a moment for the server to end, so `start` can report why it did.
async fn read_header<T>(
    read: impl std::future::Future<Output = Result<T, AdbError>>,
    exited: &watch::Receiver<bool>,
) -> Result<T, SessionError> {
    let mut exited = exited.clone();
    let outcome = tokio::select! {
        result = tokio::time::timeout(HEADER_TIMEOUT, read) => match result {
            Ok(result) => result.map_err(SessionError::from),
            Err(_) => Err(SessionError::ConnectFailed),
        },
        _ = exited.wait_for(|ended| *ended) => Err(SessionError::ConnectFailed),
    };
    if outcome.is_err() && !*exited.borrow() {
        let _ = tokio::time::timeout(EXIT_GRACE, exited.wait_for(|ended| *ended)).await;
    }
    outcome
}

async fn connect_socket(
    adb: &AdbServer,
    serial: &str,
    socket: &str,
    config: StartConfig,
    exited: &watch::Receiver<bool>,
    expect_dummy: bool,
) -> Result<TcpStream, SessionError> {
    let mut exited = exited.clone();
    for _ in 0..config.connect_attempts {
        if *exited.borrow() {
            return Err(SessionError::ConnectFailed);
        }
        if let Ok(mut stream) = adb.open_local_abstract(serial, socket).await {
            if !expect_dummy || stream.read_u8().await.is_ok() {
                return Ok(stream);
            }
        }
        tokio::select! {
            () = tokio::time::sleep(config.connect_delay) => {}
            _ = exited.changed() => {}
        }
    }
    Err(SessionError::ConnectFailed)
}

async fn write_controls(mut socket: OwnedWriteHalf, mut messages: mpsc::Receiver<Vec<u8>>) {
    while let Some(bytes) = messages.recv().await {
        if socket.write_all(&bytes).await.is_err() {
            return;
        }
    }
}

async fn read_device_messages(socket: OwnedReadHalf, clipboard: mpsc::UnboundedSender<String>) {
    let mut socket = BufReader::new(socket);
    while let Ok(Some(message)) = read_device_message(&mut socket).await {
        if let DeviceMessage::Clipboard(text) = message {
            if clipboard.send(text).is_err() {
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scrcpy::stream::fixtures::{audio_header, packet, video_header};
    use crate::scrcpy::stream::{PTS_CONFIG, PTS_KEYFRAME};
    use crate::testing::{MockAdb, MockAdbBuilder};

    const SCID: u32 = 0xabcd;
    const SOCKET: &str = "scrcpy_0000abcd";

    fn config() -> StartConfig {
        StartConfig {
            connect_attempts: 30,
            connect_delay: Duration::from_millis(10),
            scid: Some(SCID),
        }
    }

    /// `ScrcpySession::start`, failing the test instead of hanging it when a regression makes the
    /// start wait forever.
    async fn start_within(
        adb: &AdbServer,
        serial: &str,
        jar: &Path,
        options: &MirrorOptions,
        config: StartConfig,
    ) -> Result<ScrcpySession, SessionError> {
        tokio::time::timeout(
            Duration::from_secs(15),
            ScrcpySession::start(adb, serial, jar, options, config),
        )
        .await
        .expect("the start hung")
    }

    /// A scratch jar to push.
    fn jar(name: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("masaya-jar-{}-{name}", std::process::id()));
        std::fs::write(&path, b"fake jar contents").unwrap();
        path
    }

    /// Video socket: dummy byte, header, then two packets.
    fn video_socket() -> Vec<u8> {
        let mut bytes = vec![0u8];
        bytes.extend(video_header("Pixel 8", VideoCodecId::H264, 1080, 2400));
        bytes.extend(packet(PTS_CONFIG, &[0, 0, 0, 1, 0x67]));
        bytes.extend(packet(PTS_KEYFRAME | 33, &[0, 0, 0, 1, 0x65]));
        bytes
    }

    fn base(options: &MirrorOptions) -> MockAdbBuilder {
        MockAdb::new()
            .running_shell(
                &launch_command(SCID, options),
                "[server] INFO: Device: Pixel 8\n",
            )
            // Like the real server: the video header only once every socket is connected.
            .accept_all_before_sending(SOCKET)
    }

    #[tokio::test]
    async fn starts_video_and_control_and_streams_packets() {
        let options = MirrorOptions::default();
        let mock = base(&options)
            .abstract_socket(SOCKET, &video_socket())
            // The control socket opens with a clipboard message from the phone.
            .abstract_socket(SOCKET, &[0, 0, 0, 0, 2, b'o', b'k'])
            .start()
            .await;
        let jar = jar("video");

        let mut session = start_within(
            &AdbServer::new(mock.address()),
            "R5CT",
            &jar,
            &options,
            config(),
        )
        .await
        .unwrap();

        assert_eq!(session.video.codec, VideoCodecId::H264);
        assert_eq!((session.video.width, session.video.height), (1080, 2400));
        assert_eq!(session.video.device_name.as_deref(), Some("Pixel 8"));
        assert!(session.audio.is_none());

        // The server jar was pushed where the launch command expects it.
        let pushed = mock.pushed();
        assert_eq!(pushed[0].0, "/data/local/tmp/scrcpy-server.jar,33188");
        assert_eq!(pushed[0].1, b"fake jar contents");

        let mut video = session.take_video().unwrap();
        assert_eq!(
            video.next().await.unwrap(),
            Some(MediaPacket::Configuration {
                data: vec![0, 0, 0, 1, 0x67]
            })
        );
        assert_eq!(
            video.next().await.unwrap(),
            Some(MediaPacket::Data {
                keyframe: true,
                pts: 33,
                data: vec![0, 0, 0, 1, 0x65]
            })
        );

        let mut clipboard = session.take_clipboard().unwrap();
        assert_eq!(clipboard.recv().await.as_deref(), Some("ok"));

        // No socket was hung up while the session runs: a half-closed video socket makes the
        // real server stop streaming.
        tokio::time::sleep(Duration::from_millis(50)).await;
        assert!(
            mock.closed_sockets().is_empty(),
            "{:?}",
            mock.closed_sockets()
        );

        // Control messages reach the phone, in order.
        let control = session.control();
        control.send(&ControlMessage::Rotate).await.unwrap();
        control
            .send(&ControlMessage::Key {
                action: 0,
                key_code: 4,
                repeat: 0,
                meta_state: 0,
            })
            .await
            .unwrap();
        mock.wait_for_received(SOCKET, 15).await;
        assert_eq!(
            mock.received(SOCKET),
            [&[11u8][..], &[0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0][..]].concat()
        );
        std::fs::remove_file(jar).ok();
    }

    #[tokio::test]
    async fn connects_audio_between_video_and_control_when_asked() {
        let options = MirrorOptions {
            audio_enabled: true,
            ..MirrorOptions::default()
        };
        let mut audio = audio_header(AudioCodec::Opus);
        audio.extend(packet(PTS_CONFIG, &[1, 2]));
        let mock = base(&options)
            .abstract_socket(SOCKET, &video_socket())
            .abstract_socket(SOCKET, &audio)
            .abstract_socket(SOCKET, &[])
            .start()
            .await;
        let jar = jar("audio");

        let mut session = start_within(
            &AdbServer::new(mock.address()),
            "R5CT",
            &jar,
            &options,
            config(),
        )
        .await
        .unwrap();

        assert_eq!(
            session.audio,
            Some(AudioInfo {
                codec: AudioCodec::Opus
            })
        );
        let mut audio = session.take_audio().unwrap();
        assert_eq!(
            audio.next().await.unwrap(),
            Some(MediaPacket::Configuration { data: vec![1, 2] })
        );
        assert!(
            mock.closed_sockets().is_empty(),
            "{:?}",
            mock.closed_sockets()
        );
        std::fs::remove_file(jar).ok();
    }

    #[tokio::test]
    async fn a_phone_that_cannot_capture_audio_still_mirrors() {
        let options = MirrorOptions {
            audio_enabled: true,
            ..MirrorOptions::default()
        };
        let mock = base(&options)
            .abstract_socket(SOCKET, &video_socket())
            .abstract_socket(SOCKET, &[0, 0, 0, 1]) // audio errored
            .abstract_socket(SOCKET, &[])
            .start()
            .await;
        let jar = jar("noaudio");
        let session = start_within(
            &AdbServer::new(mock.address()),
            "R5CT",
            &jar,
            &options,
            config(),
        )
        .await
        .unwrap();
        assert!(session.audio.is_none());
        std::fs::remove_file(jar).ok();
    }

    #[tokio::test]
    async fn keeps_trying_while_the_server_boots() {
        let options = MirrorOptions::default();
        let mock = base(&options)
            .refuse_first(SOCKET, 5)
            .abstract_socket(SOCKET, &video_socket())
            .abstract_socket(SOCKET, &[])
            .start()
            .await;
        let jar = jar("retry");
        let session = start_within(
            &AdbServer::new(mock.address()),
            "R5CT",
            &jar,
            &options,
            config(),
        )
        .await
        .unwrap();
        assert_eq!(session.video.width, 1080);
        std::fs::remove_file(jar).ok();
    }

    #[tokio::test]
    async fn a_server_that_dies_before_sending_the_header_is_reported() {
        let options = MirrorOptions::default();
        // The sockets open (video with its dummy byte) but no header comes before the server
        // process ends.
        let mock = MockAdb::new()
            .shell_ending_after(
                &launch_command(SCID, &options),
                "[server] ERROR: Encoder not found\n",
                Duration::from_millis(200),
            )
            .abstract_socket(SOCKET, &[0])
            .abstract_socket(SOCKET, &[])
            .start()
            .await;
        let jar = jar("no-header");
        let error = start_within(
            &AdbServer::new(mock.address()),
            "R5CT",
            &jar,
            &options,
            config(),
        )
        .await
        .err()
        .expect("start must fail");
        match &error {
            SessionError::ServerExited { output } => {
                assert_eq!(output, &["[server] ERROR: Encoder not found"]);
            }
            other => panic!("unexpected: {other:?}"),
        }
        std::fs::remove_file(jar).ok();
    }

    #[tokio::test]
    async fn dropping_a_start_in_progress_stops_the_server() {
        let options = MirrorOptions::default();
        let command = launch_command(SCID, &options);
        // The header never comes: the start waits until it is dropped.
        let mock = MockAdb::new()
            .running_shell(&command, "")
            .abstract_socket(SOCKET, &[0])
            .abstract_socket(SOCKET, &[])
            .start()
            .await;
        let jar = jar("dropped");
        let address = mock.address();
        let path = jar.clone();
        let start = tokio::spawn(async move {
            let _ = ScrcpySession::start(
                &AdbServer::new(address),
                "R5CT",
                &path,
                &MirrorOptions::default(),
                config(),
            )
            .await;
        });
        tokio::time::sleep(Duration::from_millis(200)).await;
        start.abort();
        for _ in 0..100 {
            if mock.closed_shells().contains(&command) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert_eq!(mock.closed_shells(), [command]);
        std::fs::remove_file(jar).ok();
    }

    #[tokio::test]
    async fn a_server_that_dies_is_reported_with_its_last_output() {
        let options = MirrorOptions::default();
        // The command ends at once and nothing ever listens.
        let mock = MockAdb::new()
            .shell(
                &launch_command(SCID, &options),
                "[server] ERROR: Could not open video stream\n",
            )
            .start()
            .await;
        let jar = jar("died");
        let error = start_within(
            &AdbServer::new(mock.address()),
            "R5CT",
            &jar,
            &options,
            config(),
        )
        .await
        .err()
        .expect("start must fail");
        match &error {
            SessionError::ServerExited { output } => {
                assert_eq!(output, &["[server] ERROR: Could not open video stream"]);
            }
            other => panic!("unexpected: {other:?}"),
        }
        assert_eq!(
            error.user_message(Locale::En),
            "scrcpy server exited prematurely: [server] ERROR: Could not open video stream"
        );
        std::fs::remove_file(jar).ok();
    }

    #[tokio::test]
    async fn a_missing_jar_names_the_path_it_expected() {
        let mock = MockAdb::new().start().await;
        let missing = PathBuf::from("/nonexistent/scrcpy-server.jar");
        let error = start_within(
            &AdbServer::new(mock.address()),
            "R5CT",
            &missing,
            &MirrorOptions::default(),
            config(),
        )
        .await
        .err()
        .expect("start must fail");
        assert!(matches!(&error, SessionError::ServerMissing(path) if path == &missing));
        assert_eq!(
            error.user_message(Locale::Es),
            "Falta scrcpy-server. Ejecuta `pnpm setup:tools`. Ruta: /nonexistent/scrcpy-server.jar"
        );
        assert!(mock.pushed().is_empty(), "nothing is pushed without a jar");
    }

    #[tokio::test]
    async fn the_session_keeps_the_servers_output_while_it_runs() {
        let options = MirrorOptions::default();
        let mock = base(&options)
            .abstract_socket(SOCKET, &video_socket())
            .abstract_socket(SOCKET, &[])
            .start()
            .await;
        let jar = jar("output");
        let session = start_within(
            &AdbServer::new(mock.address()),
            "R5CT",
            &jar,
            &options,
            config(),
        )
        .await
        .unwrap();
        assert!(!*session.exited().borrow());
        for _ in 0..100 {
            if !session.server_output().is_empty() {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        assert_eq!(session.server_output(), ["[server] INFO: Device: Pixel 8"]);
        std::fs::remove_file(jar).ok();
    }

    #[tokio::test]
    async fn the_session_signals_when_the_server_ends_by_itself() {
        let options = MirrorOptions::default();
        let mock = MockAdb::new()
            .shell_ending_after(
                &launch_command(SCID, &options),
                "[server] INFO: Device: Pixel 8\n",
                Duration::from_millis(250),
            )
            .abstract_socket(SOCKET, &video_socket())
            .abstract_socket(SOCKET, &[])
            .start()
            .await;
        let jar = jar("ends");
        let session = start_within(
            &AdbServer::new(mock.address()),
            "R5CT",
            &jar,
            &options,
            config(),
        )
        .await
        .unwrap();

        let mut exited = session.exited();
        assert!(
            !*exited.borrow(),
            "the server is still running right after the start"
        );
        tokio::time::timeout(Duration::from_secs(3), exited.wait_for(|ended| *ended))
            .await
            .expect("the session must notice the server ended")
            .unwrap();
        std::fs::remove_file(jar).ok();
    }

    #[tokio::test]
    async fn closing_the_session_hangs_up_on_the_server() {
        let options = MirrorOptions::default();
        let command = launch_command(SCID, &options);
        let mock = base(&options)
            .abstract_socket(SOCKET, &video_socket())
            .abstract_socket(SOCKET, &[])
            .start()
            .await;
        let jar = jar("close");
        let session = start_within(
            &AdbServer::new(mock.address()),
            "R5CT",
            &jar,
            &options,
            config(),
        )
        .await
        .unwrap();
        assert!(
            mock.closed_shells().is_empty(),
            "the server runs while the session lives"
        );

        session.close();

        for _ in 0..200 {
            if mock.closed_shells().contains(&command) {
                std::fs::remove_file(jar).ok();
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!("the shell that runs the server was never closed");
    }

    fn touch(action: u8) -> ControlMessage {
        ControlMessage::Touch {
            action,
            pointer_id: -1,
            pointer_x: 1,
            pointer_y: 2,
            video_width: 100,
            video_height: 200,
            pressure: 1.0,
            buttons: 0,
            action_button: 0,
        }
    }

    #[tokio::test]
    async fn pointer_moves_are_dropped_when_the_device_is_behind_but_presses_wait() {
        // Nobody drains the queue, like a device that stopped reading.
        let (tx, mut rx) = mpsc::channel(2);
        let handle = ControlHandle::from_sender(tx);

        assert_eq!(handle.send(&touch(2)).await, Ok(SendOutcome::Sent));
        assert_eq!(handle.send(&touch(2)).await, Ok(SendOutcome::Sent));
        assert_eq!(handle.send(&touch(2)).await, Ok(SendOutcome::Dropped));
        assert_eq!(handle.dropped_moves(), 1);

        // A press is never dropped: it waits for room.
        let waiting = tokio::spawn({
            let handle = handle.clone();
            async move { handle.send(&touch(1)).await }
        });
        tokio::time::sleep(Duration::from_millis(30)).await;
        assert!(
            !waiting.is_finished(),
            "a release must wait, not be dropped"
        );
        rx.recv().await.unwrap();
        assert_eq!(waiting.await.unwrap(), Ok(SendOutcome::Sent));
    }

    #[tokio::test]
    async fn sending_after_the_connection_closed_is_an_error() {
        let (tx, rx) = mpsc::channel(1);
        drop(rx);
        let handle = ControlHandle::from_sender(tx);
        assert_eq!(
            handle.send(&ControlMessage::Rotate).await,
            Err(ControlError::Closed)
        );
        assert_eq!(handle.send(&touch(2)).await, Err(ControlError::Closed));
    }

    #[tokio::test]
    async fn oversized_text_is_rejected_before_it_is_queued() {
        let (tx, mut rx) = mpsc::channel(1);
        let handle = ControlHandle::from_sender(tx);
        let result = handle
            .send(&ControlMessage::Text {
                text: "x".repeat(301),
            })
            .await;
        assert_eq!(result, Err(ControlError::Encode(EncodeError::TextTooLong)));
        assert!(rx.try_recv().is_err());
    }

    #[test]
    fn session_ids_are_31_bits() {
        for _ in 0..50 {
            assert_eq!(random_scid() & 0x8000_0000, 0);
        }
    }
}
