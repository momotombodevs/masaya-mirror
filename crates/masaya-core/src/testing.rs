//! A fake adb server for tests: speaks enough of the smart-socket protocol to exercise the client
//! and, later, the scrcpy session, with no phone and no `adb` binary.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};

#[derive(Default)]
struct Script {
    devices: String,
    /// Output of `shell:<command>`, keyed by the command.
    shells: HashMap<String, Vec<u8>>,
    /// What a `localabstract:<name>` socket sends as soon as it opens.
    sockets: HashMap<String, Vec<u8>>,
}

#[derive(Default)]
struct Recorded {
    /// `(path,mode)` and contents of every sync push.
    pushed: Vec<(String, Vec<u8>)>,
    /// Bytes the client wrote to each abstract socket.
    received: HashMap<String, Vec<u8>>,
    /// Every request the server saw, in order.
    requests: Vec<String>,
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

    pub fn abstract_socket(mut self, name: &str, greeting: &[u8]) -> Self {
        self.script
            .sockets
            .insert(name.to_owned(), greeting.to_vec());
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
            let Some(greeting) = script.sockets.get(name) else {
                return fail(&mut stream, &format!("unscripted socket: {name}")).await;
            };
            stream.write_all(b"OKAY").await?;
            stream.write_all(greeting).await?;
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
