//! The mirror: the scrcpy server's jar, scrcpy's video turned into what macOS decodes, and the
//! registry that carries it from the pump to the view.

pub mod actions;
pub mod control;
pub mod h264;
pub mod pump;
pub mod server;
pub mod sink;
