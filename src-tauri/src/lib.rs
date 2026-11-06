//! Masaya desktop shell. Commands stay thin: the work lives in `masaya-core`.

mod commands;
mod state;

use std::sync::Arc;

use masaya_core::IpcResult;
use serde::Serialize;
use tauri::{Manager, WindowEvent};

use state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AppInfo {
    name: &'static str,
    version: &'static str,
    backend: &'static str,
}

/// Lets the renderer tell which backend it is running on (Electron or Tauri).
#[tauri::command]
fn app_info() -> IpcResult<AppInfo> {
    IpcResult::ok(AppInfo {
        name: "Masaya",
        version: env!("CARGO_PKG_VERSION"),
        backend: "tauri",
    })
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(Arc::new(AppState::new()))
        .on_window_event(|window, event| {
            if let WindowEvent::Destroyed = event {
                end_mirror_of(window);
            }
        })
        .invoke_handler(tauri::generate_handler![
            app_info,
            commands::device::list_devices,
            commands::device::get_adb_status,
            commands::device::choose_adb,
            commands::device::open_adb_download,
            commands::device::disconnect_device,
            commands::device::get_device_settings,
            commands::device::set_device_setting,
            commands::device::install_apk,
            commands::mirror::open_mirror,
            commands::mirror::set_mirror_options,
            commands::mirror::notify_mirror_stream_ready,
            commands::mirror::close_mirror,
            commands::mirror::get_mirror_status,
            commands::mirror::send_control,
            commands::window::open_mirror_window,
            commands::window::set_always_on_top,
            commands::window::set_mirror_video_layout,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Masaya");
}

/// Closing a mirror window stops its mirror, so the server does not keep running on the phone.
fn end_mirror_of(window: &tauri::Window) {
    let label = window.label().to_owned();
    let state = window.state::<Arc<AppState>>().inner().clone();
    tauri::async_runtime::spawn(async move {
        let Some(device_id) = state.windows.lock().await.remove(&label) else {
            return;
        };
        if let Some(mirror) = state.mirrors.lock().await.remove(&device_id) {
            mirror.shut_down();
        }
    });
}
