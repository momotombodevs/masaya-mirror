//! Mirror sessions: start, stream video to the window, forward input, stop.
//!
//! Electron hands the window a `MessagePort`; here the window passes a `Channel` and receives the
//! frames described in `masaya_core::scrcpy::frame`.

use std::path::PathBuf;
use std::sync::Arc;

use masaya_core::adb::AdbServer;
use masaya_core::scrcpy::frame::{self, Init, Track, VideoMetadata};
use masaya_core::scrcpy::session::{PacketReader, SessionError};
use masaya_core::scrcpy::{ControlMessage, MirrorOptions, ScrcpySession, StartConfig};
use masaya_core::IpcResult;
use serde::Serialize;
use serde_json::Value;
use tauri::async_runtime::{spawn, JoinHandle};
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use super::state;
use crate::state::{AppState, Mirror};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Opened {
    metadata: VideoMetadata,
    audio_enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    active_device_ids: Vec<String>,
}

/// `scrcpy-server.jar`: bundled in a release, taken from the repo in development.
fn server_jar(app: &AppHandle) -> PathBuf {
    let bundled = app
        .path()
        .resolve("scrcpy-server/scrcpy-server.jar", BaseDirectory::Resource);
    match bundled {
        Ok(path) if path.exists() => path,
        _ => PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../resources/scrcpy-server/scrcpy-server.jar"),
    }
}

fn parse_options(value: Option<Value>) -> Result<MirrorOptions, String> {
    let options = match value {
        None | Some(Value::Null) => MirrorOptions::default(),
        Some(value) => {
            serde_json::from_value(value).map_err(|_| "Invalid mirror options.".to_owned())?
        }
    };
    options
        .validate()
        .map_err(|_| "Invalid mirror options.".to_owned())?;
    Ok(options)
}

fn send(stream: &Channel, bytes: Vec<u8>) -> bool {
    stream.send(InvokeResponseBody::Raw(bytes)).is_ok()
}

async fn start(
    app: &AppHandle,
    state: &Arc<AppState>,
    device_id: String,
    options: Option<Value>,
    stream: Channel,
) -> IpcResult<Opened> {
    let options = match parse_options(options) {
        Ok(options) => options,
        Err(message) => return IpcResult::err(message),
    };

    // A second open of the same device (new options, or the window reloading) replaces the first
    // one. The old window is not told it ended: it is about to be rebound.
    if let Some(previous) = state.mirrors.lock().await.remove(&device_id) {
        previous.shut_down();
    }

    // `adb start-server` also tells us early when adb is missing.
    if let Err(error) = state
        .adb
        .run(&["start-server"], std::time::Duration::from_secs(15))
        .await
    {
        return error.into_ipc(state.locale());
    }

    let session = ScrcpySession::start(
        &AdbServer::default(),
        &device_id,
        &server_jar(app),
        &options,
        StartConfig::default(),
    )
    .await;
    let session = match session {
        Ok(session) => session,
        Err(error) => return IpcResult::err(describe(&error, state)),
    };

    let opened = Opened {
        metadata: VideoMetadata {
            codec: session.video.codec,
            width: session.video.width,
            height: session.video.height,
        },
        audio_enabled: options.audio_enabled && session.audio.is_some(),
    };
    state.mirrors.lock().await.insert(
        device_id,
        Mirror {
            session,
            stream,
            pumps: Vec::new(),
        },
    );
    IpcResult::ok(opened)
}

fn describe(error: &SessionError, state: &AppState) -> String {
    error.user_message(state.locale())
}

#[tauri::command]
pub async fn open_mirror(
    app: AppHandle,
    device_id: String,
    options: Option<Value>,
    on_stream: Channel,
) -> IpcResult<Opened> {
    let state = state(&app);
    start(&app, &state, device_id, options, on_stream).await
}

/// Restarts the mirror with other options. The window keeps its place and gets a new stream.
#[tauri::command]
pub async fn set_mirror_options(
    app: AppHandle,
    device_id: String,
    options: Value,
    on_stream: Channel,
) -> IpcResult<Opened> {
    let state = state(&app);
    start(&app, &state, device_id, Some(options), on_stream).await
}

/// The window is listening: send `init` and start forwarding. Safe to call again after a reload,
/// when only `init` is repeated.
#[tauri::command]
pub async fn notify_mirror_stream_ready(app: AppHandle, device_id: String) -> IpcResult<()> {
    let state = state(&app);
    let mut mirrors = state.mirrors.lock().await;
    let Some(mirror) = mirrors.get_mut(&device_id) else {
        return IpcResult::err("No hay una sesión de espejo activa.");
    };

    let audio = mirror.session.audio.map(|info| info.codec);
    let init = frame::encode_init(&Init {
        device_id: &device_id,
        video: VideoMetadata {
            codec: mirror.session.video.codec,
            width: mirror.session.video.width,
            height: mirror.session.video.height,
        },
        audio_codec: audio.map(|codec| codec.mime_type()),
        audio_web_codec_id: audio
            .map(|codec| codec.web_codec_id())
            .filter(|id| !id.is_empty()),
    });
    send(&mirror.stream, init);

    if !mirror.pumps.is_empty() {
        return IpcResult::ok(());
    }
    if let Some(video) = mirror.session.take_video() {
        mirror.pumps.push(pump(
            Track::Video,
            video,
            mirror.stream.clone(),
            Some((state.clone(), device_id.clone())),
        ));
    }
    if let Some(audio) = mirror.session.take_audio() {
        mirror
            .pumps
            .push(pump(Track::Audio, audio, mirror.stream.clone(), None));
    }
    IpcResult::ok(())
}

/// Forwards one track until the device stops sending. When the video ends the window is told, so
/// it can show why instead of freezing. Audio ending alone is not worth interrupting the video.
fn pump(
    track: Track,
    mut reader: PacketReader,
    stream: Channel,
    on_end: Option<(Arc<AppState>, String)>,
) -> JoinHandle<()> {
    spawn(async move {
        let outcome = loop {
            match reader.next().await {
                Ok(Some(packet)) => {
                    if !send(&stream, frame::encode_packet(track, &packet)) {
                        return; // the window is gone
                    }
                }
                Ok(None) => break None,
                Err(error) => break Some(error.to_string()),
            }
        };
        if let Some((state, device_id)) = on_end {
            let reason = match outcome {
                Some(reason) => Some(reason),
                None => Some("Video stream ended".to_owned()),
            };
            send(&stream, frame::encode_close(reason.as_deref()));
            // The device is gone either way: release the session so a new open starts clean.
            if let Some(mirror) = state.mirrors.lock().await.remove(&device_id) {
                for other in &mirror.pumps {
                    other.abort();
                }
                mirror.session.close();
            }
        }
    })
}

#[tauri::command]
pub async fn close_mirror(app: AppHandle, device_id: String) -> IpcResult<()> {
    let state = state(&app);
    if let Some(mirror) = state.mirrors.lock().await.remove(&device_id) {
        send(&mirror.stream, frame::encode_close(None));
        mirror.shut_down();
    }
    IpcResult::ok(())
}

#[tauri::command]
pub async fn get_mirror_status(app: AppHandle) -> IpcResult<Status> {
    let mut ids: Vec<String> = state(&app).mirrors.lock().await.keys().cloned().collect();
    ids.sort();
    IpcResult::ok(Status {
        active_device_ids: ids,
    })
}

#[tauri::command]
pub async fn send_control(app: AppHandle, device_id: String, message: Value) -> IpcResult<()> {
    let Ok(message) = serde_json::from_value::<ControlMessage>(message) else {
        return IpcResult::err("Invalid control message.");
    };
    if message.validate().is_err() {
        return IpcResult::err("Invalid control message.");
    }
    // The lock is held only to copy the handle: sending may wait on a slow phone.
    let control = match state(&app).mirrors.lock().await.get(&device_id) {
        Some(mirror) => mirror.session.control(),
        None => return IpcResult::err("No hay una sesión de espejo activa."),
    };
    match control.send(&message).await {
        Ok(_) => IpcResult::ok(()),
        Err(error) => IpcResult::err(error.to_string()),
    }
}
