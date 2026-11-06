//! Device list, adb setup, per-device settings and APK install.

use std::path::PathBuf;

use masaya_core::adb::AdbCli;
use masaya_core::adb::{AndroidDevice, DeviceSettingKey, DeviceSettings};
use masaya_core::IpcResult;
use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

use super::state;

const ADB_DOWNLOAD_URL: &str = "https://developer.android.com/tools/releases/platform-tools";

#[derive(Debug, Serialize)]
pub struct AdbStatus {
    path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Message {
    message: String,
}

#[derive(Debug, Serialize)]
pub struct Installed {
    installed: bool,
}

#[tauri::command]
pub async fn list_devices(app: AppHandle) -> IpcResult<Vec<AndroidDevice>> {
    let state = state(&app);
    match state.adb.list_devices().await {
        Ok(devices) => IpcResult::ok(devices),
        Err(error) => error.into_ipc(state.locale()),
    }
}

#[tauri::command]
pub async fn get_adb_status(app: AppHandle) -> IpcResult<AdbStatus> {
    let path = state(&app).adb.executable_path().await;
    IpcResult::ok(AdbStatus {
        path: path.map(|path| path.to_string_lossy().into_owned()),
    })
}

/// Asks for an `adb` executable. `path` is null when the dialog was closed without choosing.
#[tauri::command]
pub async fn choose_adb(app: AppHandle) -> IpcResult<AdbStatus> {
    let Some(picked) = pick_file(&app, &[]).await else {
        return IpcResult::ok(AdbStatus { path: None });
    };
    if !AdbCli::verify_executable(&picked).await {
        return IpcResult::err("El archivo elegido no es adb.");
    }
    let state = state(&app);
    state.adb.set_custom_path(Some(picked));
    let path = state.adb.executable_path().await;
    IpcResult::ok(AdbStatus {
        path: path.map(|path| path.to_string_lossy().into_owned()),
    })
}

#[tauri::command]
pub fn open_adb_download(app: AppHandle) -> IpcResult<()> {
    app.opener()
        .open_url(ADB_DOWNLOAD_URL, None::<&str>)
        .map_err(|error| error.to_string())
        .into()
}

#[tauri::command]
pub async fn disconnect_device(app: AppHandle, device_id: String) -> IpcResult<Message> {
    let state = state(&app);
    match state.adb.disconnect(&device_id).await {
        Ok(message) => IpcResult::ok(Message { message }),
        Err(error) => error.into_ipc(state.locale()),
    }
}

#[tauri::command]
pub async fn get_device_settings(app: AppHandle, device_id: String) -> IpcResult<DeviceSettings> {
    let state = state(&app);
    match state.adb.device_settings(&device_id).await {
        Ok(settings) => IpcResult::ok(settings),
        Err(error) => error.into_ipc(state.locale()),
    }
}

#[tauri::command]
pub async fn set_device_setting(
    app: AppHandle,
    device_id: String,
    key: DeviceSettingKey,
    enabled: bool,
) -> IpcResult<()> {
    let state = state(&app);
    match state.adb.set_device_setting(&device_id, key, enabled).await {
        Ok(()) => IpcResult::ok(()),
        Err(error) => error.into_ipc(state.locale()),
    }
}

/// Installs an APK. Without `path` the user picks the file; closing the dialog is not an error.
#[tauri::command]
pub async fn install_apk(
    app: AppHandle,
    device_id: String,
    path: Option<String>,
) -> IpcResult<Installed> {
    let apk = match path {
        Some(path) => PathBuf::from(path),
        None => match pick_file(&app, &["apk"]).await {
            Some(picked) => picked,
            None => return IpcResult::ok(Installed { installed: false }),
        },
    };
    if apk.extension().and_then(|ext| ext.to_str()) != Some("apk") {
        return IpcResult::err("El archivo no es un APK.");
    }
    let state = state(&app);
    match state.adb.install_apk(&device_id, &apk).await {
        Ok(()) => IpcResult::ok(Installed { installed: true }),
        Err(error) => error.into_ipc(state.locale()),
    }
}

async fn pick_file(app: &AppHandle, extensions: &[&str]) -> Option<PathBuf> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut dialog = app.dialog().file();
    if !extensions.is_empty() {
        dialog = dialog.add_filter("APK", extensions);
    }
    dialog.pick_file(move |picked| {
        let _ = tx.send(picked.and_then(|file| file.into_path().ok()));
    });
    rx.await.ok().flatten()
}
