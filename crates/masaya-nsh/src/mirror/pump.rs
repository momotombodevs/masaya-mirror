//! Forwards a session's video to its view until the phone stops sending. Ports the Tauri shell's
//! `pump`: runs on a tokio worker (`nsh_core::background`), never on the engine thread.

use masaya_core::scrcpy::session::PacketReader;
use masaya_core::scrcpy::stream::MediaPacket;

use super::sink::Registry;

/// Hands one packet to the view of `key`.
pub fn deliver(registry: &Registry, key: &str, packet: &MediaPacket) {
    match packet {
        MediaPacket::Configuration { data } => registry.configure(key, data),
        MediaPacket::Data { keyframe, data, .. } => registry.frame(key, data, *keyframe),
    }
}

/// Reads until the stream ends. `None` when the phone closed it cleanly, else why it broke.
pub async fn pump(mut reader: PacketReader, registry: &Registry, key: &str) -> Option<String> {
    loop {
        match reader.next().await {
            Ok(Some(packet)) => deliver(registry, key, &packet),
            Ok(None) => return None,
            Err(error) => return Some(error.to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;
    use crate::mirror::sink::FrameSink;

    #[derive(Default)]
    struct Recorder(Mutex<Vec<(bool, usize)>>);

    impl FrameSink for Recorder {
        fn configure(&self, config: &[u8]) {
            self.0.lock().unwrap().push((true, config.len()));
        }
        fn frame(&self, data: &[u8], _keyframe: bool) {
            self.0.lock().unwrap().push((false, data.len()));
        }
    }

    #[test]
    fn configuration_and_frames_go_to_their_view() {
        let registry = Registry::default();
        registry.open("k");
        let recorder = Arc::new(Recorder::default());
        registry.attach("k", recorder.clone());
        deliver(
            &registry,
            "k",
            &MediaPacket::Configuration { data: vec![0; 4] },
        );
        deliver(
            &registry,
            "k",
            &MediaPacket::Data {
                keyframe: true,
                pts: 1,
                data: vec![0; 9],
            },
        );
        assert_eq!(*recorder.0.lock().unwrap(), [(true, 4), (false, 9)]);
    }
}
