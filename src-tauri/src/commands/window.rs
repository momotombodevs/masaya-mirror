//! Windows: one per mirrored device.

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use masaya_core::IpcResult;

use super::state;

/// Percent-encodes everything but unreserved characters, so a device id like `192.168.1.5:5555`
/// survives in a query string.
fn encode(text: &str) -> String {
    text.bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                char::from(byte).to_string()
            }
            other => format!("%{other:02X}"),
        })
        .collect()
}

/// Window labels allow letters, digits and `-/:_` only.
fn label_for(device_id: &str) -> String {
    let safe: String = device_id
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect();
    format!("mirror-{safe}")
}

#[tauri::command]
pub async fn open_mirror_window(
    app: AppHandle,
    device_id: String,
    device_label: Option<String>,
) -> IpcResult<()> {
    let label = label_for(&device_id);
    if let Some(existing) = app.get_webview_window(&label) {
        let _ = existing.unminimize();
        let _ = existing.set_focus();
        return IpcResult::ok(());
    }

    let title = device_label.clone().unwrap_or_else(|| device_id.clone());
    let url = format!(
        "index.html?deviceId={}&label={}",
        encode(&device_id),
        encode(&title)
    );
    let built = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App(url.into()))
        .title(title)
        .inner_size(420.0, 880.0)
        .min_inner_size(240.0, 320.0)
        .build();
    match built {
        Ok(_) => {
            state(&app).windows.lock().await.insert(label, device_id);
            IpcResult::ok(())
        }
        Err(error) => IpcResult::err(error.to_string()),
    }
}

#[tauri::command]
pub fn set_always_on_top(window: WebviewWindow, enabled: bool) -> IpcResult<()> {
    window
        .set_always_on_top(enabled)
        .map_err(|e| e.to_string())
        .into()
}

/// The window sizes itself to the video in Electron (`mirror-layout.ts`); not ported yet.
#[tauri::command]
pub fn set_mirror_video_layout(
    _device_id: String,
    _video_width: u32,
    _video_height: u32,
) -> IpcResult<()> {
    IpcResult::ok(())
}
