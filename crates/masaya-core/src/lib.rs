//! Masaya core: everything that talks to a phone, with no UI or windowing dependencies.
//!
//! The Tauri shell (`src-tauri`) is a thin layer over this crate. Keeping the core free of Tauri
//! lets it be compiled and tested anywhere, including CI machines without WebView libraries.

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
