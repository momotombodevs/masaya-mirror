//! Turning mouse, wheel and keyboard events into scrcpy control messages. Pure: no NSH or AppKit
//! types, so each rule is unit tested.

pub mod events;
pub mod indicators;
pub mod keys;
pub mod mapping;
pub mod scroll;
