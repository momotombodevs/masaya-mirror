//! A fake adb server for tests: speaks enough of the smart-socket protocol to exercise the client
//! and, later, the scrcpy session, with no phone and no `adb` binary.

use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

#[derive(Default)]
struct Script {
    devices: String,
    /// Output of `shell:<command>`, keyed by the command. The command ends right after it.
    shells: HashMap<String, Vec<u8>>,
    /// Like `shells`, but the command keeps running until the client hangs up.
    running_shells: HashMap<String, (Vec<u8>, Option<Duration>)>,
    /// What each connection to a `localabstract:<name>` socket sends as soon as it opens. The
    /// first connection gets the first entry, and so on, like the server accepting in order.
    sockets: Mutex<HashMap<String, VecDeque<Vec<u8>>>>,
    /// Connections to a socket that are refused before it starts to work (the server is booting).
    refusals: Mutex<HashMap<String, u32>>,
}

#[derive(Default)]
struct Recorded {
    /// `(path,mode)` and contents of every sync push.
    pushed: Vec<(String, Vec<u8>)>,
    /// Bytes the client wrote to each abstract socket.
    received: HashMap<String, Vec<u8>>,
    /// Every request the server saw, in order.
    requests: Vec<String>,
    /// Commands whose client hung up while they were still running.
    closed_shells: Vec<String>,
}

pub struct MockAdbBuilder {
    script: Script,
}

pub struct MockAdb {
    address: String,
    recorded: Arc<Mutex<Recorded>>,
}

impl MockAdb {
    #[allow(clippy::new_ret_no_self)]
    pub fn new() -> MockAdbBuilder {
        MockAdbBuilder {
            script: Script::default(),
        }
    }

    pub fn address(&self) -> String {
        self.address.clone()
    }

    pub fn pushed(&self) -> Vec<(String, Vec<u8>)> {
        self.recorded.lock().unwrap().pushed.clone()
    }

    pub fn received(&self, socket: &str) -> Vec<u8> {
        self.recorded
            .lock()
            .unwrap()
            .received
            .get(socket)
            .cloned()
            .unwrap_or_default()
    }

    /// Commands that were still running when their client hung up.
    pub fn closed_shells(&self) -> Vec<String> {
        self.recorded.lock().unwrap().closed_shells.clone()
    }

    #[allow(dead_code)]
    pub fn requests(&self) -> Vec<String> {
        self.recorded.lock().unwrap().requests.clone()
    }

    /// Waits until at least `len` bytes arrived on `socket` (or fails after two seconds).
    pub async fn wait_for_received(&self, socket: &str, len: usize) {
        for _ in 0..200 {
            if self.received(socket).len() >= len {
                return;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
        panic!(
            "socket {socket} received {} of {len} bytes",
            self.received(socket).len()
        );
    }
}

impl MockAdbBuilder {
    pub fn devices(mut self, listing: &str) -> Self {
        self.script.devices = listing.to_owned();
        self
    }

    pub fn shell(mut self, command: &str, output: &str) -> Self {
        self.script
            .shells
            .insert(command.to_owned(), output.as_bytes().to_vec());
        self
    }

    /// A command that keeps running after printing `banner`, until the client closes it.
    pub fn running_shell(mut self, command: &str, banner: &str) -> Self {
        self.script
            .running_shells
            .insert(command.to_owned(), (banner.as_bytes().to_vec(), None));
        self
    }

    /// A command that prints `banner`, runs for `lifetime` and then ends by itself.
    pub fn shell_ending_after(mut self, command: &str, banner: &str, lifetime: Duration) -> Self {
        self.script.running_shells.insert(
            command.to_owned(),
            (banner.as_bytes().to_vec(), Some(lifetime)),
        );
        self
    }

    /// Adds one connection to `name`; call it again for the next connection.
    pub fn abstract_socket(self, name: &str, greeting: &[u8]) -> Self {
        self.script
            .sockets
            .lock()
            .unwrap()
            .entry(name.to_owned())
            .or_default()
            .push_back(greeting.to_vec());
        self
    }

    /// Refuses the first `count` connections to `name`, as when the server is still starting.
    pub fn refuse_first(self, name: &str, count: u32) -> Self {
        self.script
            .refusals
            .lock()
            .unwrap()
            .insert(name.to_owned(), count);
        self
    }

    pub async fn start(self) -> MockAdb {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap().to_string();
        let script = Arc::new(self.script);
        let recorded = Arc::new(Mutex::new(Recorded::default()));
        let (script_for_task, recorded_for_task) = (script.clone(), recorded.clone());
        tokio::spawn(async move {
            while let Ok((stream, _)) = listener.accept().await {
                let (script, recorded) = (script_for_task.clone(), recorded_for_task.clone());
                tokio::spawn(async move {
                    let _ = serve(stream, &script, &recorded).await;
                });
            }
        });
        MockAdb { address, recorded }
    }
}

async fn read_request(stream: &mut TcpStream) -> std::io::Result<String> {
    let mut len_hex = [0u8; 4];
    stream.read_exact(&mut len_hex).await?;
    let len = usize::from_str_radix(std::str::from_utf8(&len_hex).unwrap(), 16).unwrap();
    let mut payload = vec![0u8; len];
    stream.read_exact(&mut payload).await?;
    Ok(String::from_utf8(payload).unwrap())
}

async fn fail(stream: &mut TcpStream, message: &str) -> std::io::Result<()> {
    stream
        .write_all(format!("FAIL{:04x}{message}", message.len()).as_bytes())
        .await
}

async fn serve(
    mut stream: TcpStream,
    script: &Script,
    recorded: &Mutex<Recorded>,
) -> std::io::Result<()> {
    let mut device: Option<String> = None;
    loop {
        let request = read_request(&mut stream).await?;
        recorded.lock().unwrap().requests.push(request.clone());

        if request == "host:devices-l" {
            stream.write_all(b"OKAY").await?;
            stream
                .write_all(format!("{:04x}{}", script.devices.len(), script.devices).as_bytes())
                .await?;
            return Ok(());
        }
        if let Some(serial) = request.strip_prefix("host:transport:") {
            if serial == "NOPE" {
                return fail(&mut stream, &format!("device '{serial}' not found")).await;
            }
            device = Some(serial.to_owned());
            stream.write_all(b"OKAY").await?;
            continue;
        }
        if device.is_none() {
            return fail(&mut stream, "no transport selected").await;
        }
        if let Some(command) = request.strip_prefix("shell:") {
            if let Some((banner, lifetime)) = script.running_shells.get(command) {
                stream.write_all(b"OKAY").await?;
                stream.write_all(banner).await?;
                let hang_up = async {
                    let mut sink = [0u8; 64];
                    while stream.read(&mut sink).await? > 0 {}
                    Ok::<_, std::io::Error>(())
                };
                match lifetime {
                    // Ends by itself, like a server whose phone was unplugged.
                    Some(lifetime) => {
                        let _ = tokio::time::timeout(*lifetime, hang_up).await;
                    }
                    None => {
                        hang_up.await?;
                    }
                }
                recorded
                    .lock()
                    .unwrap()
                    .closed_shells
                    .push(command.to_owned());
                return Ok(());
            }
            match script.shells.get(command) {
                Some(output) => {
                    stream.write_all(b"OKAY").await?;
                    stream.write_all(output).await?;
                }
                None => return fail(&mut stream, &format!("unscripted shell: {command}")).await,
            }
            return Ok(());
        }
        if let Some(name) = request.strip_prefix("localabstract:") {
            let refused = {
                let mut refusals = script.refusals.lock().unwrap();
                match refusals.get_mut(name) {
                    Some(left) if *left > 0 => {
                        *left -= 1;
                        true
                    }
                    _ => false,
                }
            };
            if refused {
                return fail(&mut stream, "closed").await;
            }
            let greeting = script
                .sockets
                .lock()
                .unwrap()
                .get_mut(name)
                .and_then(VecDeque::pop_front);
            let Some(greeting) = greeting else {
                return fail(&mut stream, &format!("unscripted socket: {name}")).await;
            };
            stream.write_all(b"OKAY").await?;
            stream.write_all(&greeting).await?;
            let mut buffer = [0u8; 4096];
            loop {
                let read = stream.read(&mut buffer).await?;
                if read == 0 {
                    return Ok(());
                }
                recorded
                    .lock()
                    .unwrap()
                    .received
                    .entry(name.to_owned())
                    .or_default()
                    .extend_from_slice(&buffer[..read]);
            }
        }
        if request == "sync:" {
            stream.write_all(b"OKAY").await?;
            return serve_sync(&mut stream, recorded).await;
        }
        return fail(&mut stream, &format!("unsupported request: {request}")).await;
    }
}

async fn serve_sync(stream: &mut TcpStream, recorded: &Mutex<Recorded>) -> std::io::Result<()> {
    let mut id = [0u8; 4];
    let mut len = [0u8; 4];
    stream.read_exact(&mut id).await?;
    stream.read_exact(&mut len).await?;
    assert_eq!(&id, b"SEND");
    let mut target = vec![0u8; u32::from_le_bytes(len) as usize];
    stream.read_exact(&mut target).await?;

    let mut contents = Vec::new();
    loop {
        stream.read_exact(&mut id).await?;
        stream.read_exact(&mut len).await?;
        match &id {
            b"DATA" => {
                let mut chunk = vec![0u8; u32::from_le_bytes(len) as usize];
                stream.read_exact(&mut chunk).await?;
                contents.extend_from_slice(&chunk);
            }
            b"DONE" => break,
            other => panic!("unexpected sync id {other:?}"),
        }
    }
    recorded
        .lock()
        .unwrap()
        .pushed
        .push((String::from_utf8(target).unwrap(), contents));
    stream.write_all(b"OKAY\0\0\0\0").await
}
