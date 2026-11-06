//! Masaya core: everything that talks to a phone, with no UI or windowing dependencies.
//!
//! The Tauri shell (`src-tauri`) is a thin layer over this crate. Keeping the core free of Tauri
//! lets it be compiled and tested anywhere, including CI machines without WebView libraries.

pub mod ipc;

pub use ipc::{ErrorCode, IpcResult, ADB_NOT_FOUND_MESSAGE};
