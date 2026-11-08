//! The scrcpy protocol, version 3.3.x: how to launch the server, what it sends back (video, audio
//! and device messages) and what the client may send it (control messages).
//!
//! Byte layouts are the ones `@yume-chan/scrcpy` 2.3 uses for server 3.3.3, the server version this
//! app ships. All integers are big-endian.

pub mod control;
pub mod frame;
pub mod options;
pub mod session;
pub mod stream;
pub mod validate;

pub use control::{ControlMessage, DeviceMessage};
pub use options::{MirrorOptions, VideoCodec};
pub use session::{ScrcpySession, StartConfig};
pub use stream::{AudioCodec, MediaPacket, VideoCodecId};
