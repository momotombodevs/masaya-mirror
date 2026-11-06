//! Masaya desktop shell. Commands stay thin: the work lives in `masaya-core`.

use masaya_core::IpcResult;
use serde::Serialize;

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
        .invoke_handler(tauri::generate_handler![app_info])
        .run(tauri::generate_context!())
        .expect("error while running Masaya");
}
