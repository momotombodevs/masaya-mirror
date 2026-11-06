//! The commands the renderer calls. Names are the snake_case of the Electron `MasayaApi` methods.

pub mod device;
pub mod mirror;
pub mod window;

use std::sync::Arc;

use tauri::{AppHandle, Manager};

use crate::state::AppState;

/// Async commands cannot borrow `State` and also return a plain value, so they take the handle.
pub fn state(app: &AppHandle) -> Arc<AppState> {
    app.state::<Arc<AppState>>().inner().clone()
}
