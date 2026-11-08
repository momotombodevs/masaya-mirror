//! Masaya core: everything that talks to a phone, with no UI or windowing dependencies.
//!
//! Desktop shells are thin layers over this crate. Keeping the core free of UI code lets it be
//! compiled and tested anywhere, including CI machines without windowing libraries.

pub mod adb;
pub mod error;
pub mod i18n;
pub mod ipc;
pub mod scrcpy;

#[cfg(test)]
mod testing;

pub use error::AdbError;
pub use i18n::{Locale, Msg};
pub use ipc::{ErrorCode, IpcResult, ADB_NOT_FOUND_MESSAGE};
