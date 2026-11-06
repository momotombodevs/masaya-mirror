//! A client for the adb server's "smart socket" protocol (default `127.0.0.1:5037`).
//!
//! The command line is fine for one-shot commands, but scrcpy needs long-lived byte streams to the
//! phone: a shell for the server process, its video, audio and control sockets, and a file push.
//! This module speaks to the adb server directly for those, like `@yume-chan/adb` does.
//!
//! Every request is `{length as 4 hex digits}{payload}` and is answered with `OKAY` or with `FAIL`
//! followed by a length-prefixed message. After a `host:transport:<serial>` request, the same
//! connection talks to that device, and a second request (`shell:`, `sync:`, `localabstract:`)
//! turns it into a raw stream.

use std::time::Duration;

use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpStream, ToSocketAddrs};

use crate::error::AdbError;

pub const DEFAULT_ADB_ADDRESS: &str = "127.0.0.1:5037";
const CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
/// `sync` DATA chunks may carry at most 64 KiB.
const SYNC_CHUNK: usize = 64 * 1024;

/// A regular file with `rw-r--r--`, as `adb push` creates.
pub const DEFAULT_FILE_MODE: u32 = 0o100_644;

#[derive(Debug, Clone)]
pub struct AdbServer {
    address: String,
}

impl Default for AdbServer {
    fn default() -> Self {
        Self::new(DEFAULT_ADB_ADDRESS)
    }
}

impl AdbServer {
    pub fn new(address: impl Into<String>) -> Self {
        Self {
            address: address.into(),
        }
    }

    async fn connect(&self) -> Result<TcpStream, AdbError> {
        connect_with_timeout(&self.address).await
    }

    /// Sends one request on a fresh connection and checks the status.
    async fn request(&self, request: &str) -> Result<TcpStream, AdbError> {
        let mut stream = self.connect().await?;
        send_request(&mut stream, request).await?;
        Ok(stream)
    }

    /// `adb devices -l`, answered by the server itself.
    pub async fn devices_long(&self) -> Result<String, AdbError> {
        let mut stream = self.request("host:devices-l").await?;
        let payload = read_length_prefixed(&mut stream).await?;
        Ok(String::from_utf8_lossy(&payload).into_owned())
    }

    /// Opens a connection that talks to `serial`: further requests on it go to that device.
    async fn transport(&self, serial: &str) -> Result<TcpStream, AdbError> {
        self.request(&format!("host:transport:{serial}")).await
    }

    /// Starts `command` in a shell on the device and returns the raw output stream. The command
    /// ends when the stream closes; dropping the stream stops it.
    pub async fn shell_stream(&self, serial: &str, command: &str) -> Result<TcpStream, AdbError> {
        let mut stream = self.transport(serial).await?;
        send_request(&mut stream, &format!("shell:{command}")).await?;
        Ok(stream)
    }

    /// Runs `command` in a shell and returns everything it printed.
    pub async fn shell(&self, serial: &str, command: &str) -> Result<String, AdbError> {
        let mut stream = self.shell_stream(serial, command).await?;
        let mut out = Vec::new();
        stream.read_to_end(&mut out).await?;
        Ok(String::from_utf8_lossy(&out).into_owned())
    }

    /// Connects to an abstract unix socket on the device (scrcpy's tunnel, in forward mode).
    pub async fn open_local_abstract(
        &self,
        serial: &str,
        name: &str,
    ) -> Result<TcpStream, AdbError> {
        let mut stream = self.transport(serial).await?;
        send_request(&mut stream, &format!("localabstract:{name}")).await?;
        Ok(stream)
    }

    /// Writes `data` to `remote_path` on the device through the sync protocol.
    pub async fn push(
        &self,
        serial: &str,
        remote_path: &str,
        data: &[u8],
        mode: u32,
        mtime: u32,
    ) -> Result<(), AdbError> {
        let mut stream = self.transport(serial).await?;
        send_request(&mut stream, "sync:").await?;

        let target = format!("{remote_path},{mode}");
        write_sync_header(&mut stream, b"SEND", target.len()).await?;
        stream.write_all(target.as_bytes()).await?;
        for chunk in data.chunks(SYNC_CHUNK) {
            write_sync_header(&mut stream, b"DATA", chunk.len()).await?;
            stream.write_all(chunk).await?;
        }
        stream.write_all(b"DONE").await?;
        stream.write_all(&mtime.to_le_bytes()).await?;
        stream.flush().await?;

        let mut reply = [0u8; 8];
        stream.read_exact(&mut reply).await?;
        match &reply[..4] {
            b"OKAY" => Ok(()),
            b"FAIL" => {
                let len = u32::from_le_bytes(reply[4..].try_into().expect("4 bytes")) as usize;
                let mut message = vec![0u8; len];
                stream.read_exact(&mut message).await?;
                Err(AdbError::Failed(
                    String::from_utf8_lossy(&message).into_owned(),
                ))
            }
            other => Err(AdbError::Failed(format!(
                "unexpected sync reply: {}",
                String::from_utf8_lossy(other)
            ))),
        }
    }
}

async fn connect_with_timeout(address: impl ToSocketAddrs) -> Result<TcpStream, AdbError> {
    let stream = tokio::time::timeout(CONNECT_TIMEOUT, TcpStream::connect(address))
        .await
        .map_err(|_| AdbError::TimedOut)?
        .map_err(|error| AdbError::Failed(format!("Could not reach the adb server: {error}")))?;
    stream.set_nodelay(true)?;
    Ok(stream)
}

async fn write_sync_header(
    stream: &mut TcpStream,
    id: &[u8; 4],
    len: usize,
) -> Result<(), AdbError> {
    stream.write_all(id).await?;
    stream.write_all(&(len as u32).to_le_bytes()).await?;
    Ok(())
}

/// Sends `request` and waits for the server's `OKAY`.
async fn send_request(stream: &mut TcpStream, request: &str) -> Result<(), AdbError> {
    let frame = format!("{:04x}{request}", request.len());
    stream.write_all(frame.as_bytes()).await?;
    stream.flush().await?;

    let mut status = [0u8; 4];
    stream.read_exact(&mut status).await?;
    match &status {
        b"OKAY" => Ok(()),
        b"FAIL" => {
            let message = read_length_prefixed(stream).await?;
            Err(AdbError::Failed(
                String::from_utf8_lossy(&message).into_owned(),
            ))
        }
        other => Err(AdbError::Failed(format!(
            "unexpected adb reply: {}",
            String::from_utf8_lossy(other)
        ))),
    }
}

/// Reads a payload that starts with its length as 4 hex digits.
async fn read_length_prefixed(stream: &mut TcpStream) -> Result<Vec<u8>, AdbError> {
    let mut len_hex = [0u8; 4];
    stream.read_exact(&mut len_hex).await?;
    let len = std::str::from_utf8(&len_hex)
        .ok()
        .and_then(|hex| usize::from_str_radix(hex, 16).ok())
        .ok_or_else(|| AdbError::Failed("adb sent a malformed length".into()))?;
    let mut payload = vec![0u8; len];
    stream.read_exact(&mut payload).await?;
    Ok(payload)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::MockAdb;

    #[tokio::test]
    async fn lists_devices_from_the_server() {
        let mock = MockAdb::new()
            .devices("R5CT\tdevice usb:1 model:Pixel_8\n")
            .start()
            .await;
        let listing = AdbServer::new(mock.address()).devices_long().await.unwrap();
        assert_eq!(listing, "R5CT\tdevice usb:1 model:Pixel_8\n");
    }

    #[tokio::test]
    async fn shell_returns_everything_the_command_printed() {
        let mock = MockAdb::new().shell("echo hi", "hi\nthere\n").start().await;
        let out = AdbServer::new(mock.address())
            .shell("R5CT", "echo hi")
            .await
            .unwrap();
        assert_eq!(out, "hi\nthere\n");
    }

    #[tokio::test]
    async fn a_failing_request_surfaces_the_servers_message() {
        let mock = MockAdb::new().start().await;
        let error = AdbServer::new(mock.address())
            .shell("NOPE", "id")
            .await
            .unwrap_err();
        assert!(
            matches!(&error, AdbError::Failed(m) if m.contains("device 'NOPE' not found")),
            "{error:?}"
        );
    }

    #[tokio::test]
    async fn pushes_a_file_in_sync_chunks() {
        let mock = MockAdb::new().start().await;
        // Bigger than one 64 KiB chunk, so the chunking path runs.
        let data: Vec<u8> = (0..150_000u32).map(|n| (n % 251) as u8).collect();
        AdbServer::new(mock.address())
            .push(
                "R5CT",
                "/data/local/tmp/scrcpy-server.jar",
                &data,
                DEFAULT_FILE_MODE,
                1,
            )
            .await
            .unwrap();
        let pushed = mock.pushed();
        assert_eq!(pushed.len(), 1);
        assert_eq!(pushed[0].0, "/data/local/tmp/scrcpy-server.jar,33188");
        assert_eq!(pushed[0].1, data);
    }

    #[tokio::test]
    async fn opens_an_abstract_socket_that_carries_bytes_both_ways() {
        let mock = MockAdb::new()
            .abstract_socket("scrcpy_0000abcd", b"\x00hello")
            .start()
            .await;
        let mut stream = AdbServer::new(mock.address())
            .open_local_abstract("R5CT", "scrcpy_0000abcd")
            .await
            .unwrap();
        let mut greeting = [0u8; 6];
        stream.read_exact(&mut greeting).await.unwrap();
        assert_eq!(&greeting, b"\x00hello");
        stream.write_all(b"ping").await.unwrap();
        stream.shutdown().await.unwrap();
        mock.wait_for_received("scrcpy_0000abcd", 4).await;
        assert_eq!(mock.received("scrcpy_0000abcd"), b"ping");
    }

    #[tokio::test]
    async fn an_unreachable_server_is_a_clear_failure() {
        // Port 1 on localhost is closed.
        let error = AdbServer::new("127.0.0.1:1")
            .devices_long()
            .await
            .unwrap_err();
        assert!(
            matches!(&error, AdbError::Failed(m) if m.starts_with("Could not reach the adb server")),
            "{error:?}"
        );
    }
}
