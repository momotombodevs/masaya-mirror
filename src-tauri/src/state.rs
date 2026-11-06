//! Everything the commands share.

use std::collections::HashMap;

use masaya_core::adb::AdbCli;
use masaya_core::scrcpy::ScrcpySession;
use masaya_core::Locale;
use tauri::async_runtime::JoinHandle;
use tauri::ipc::Channel;
use tokio::sync::Mutex;

/// One device being mirrored: its scrcpy session and the channel to the window that shows it.
pub struct Mirror {
    pub session: ScrcpySession,
    pub stream: Channel,
    /// The tasks that forward video and audio to `stream`. Empty until the window is ready.
    pub pumps: Vec<JoinHandle<()>>,
}

impl Mirror {
    /// Stops forwarding and ends the session, which stops the server on the phone.
    pub fn shut_down(self) {
        for pump in &self.pumps {
            pump.abort();
        }
        self.session.close();
    }
}

pub struct AppState {
    pub adb: AdbCli,
    /// Mirrors by device id.
    pub mirrors: Mutex<HashMap<String, Mirror>>,
    /// Mirror window label → device id, so closing a window ends its mirror.
    pub windows: Mutex<HashMap<String, String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            adb: AdbCli::new(Locale::default()),
            mirrors: Mutex::new(HashMap::new()),
            windows: Mutex::new(HashMap::new()),
        }
    }

    pub fn locale(&self) -> Locale {
        self.adb.locale()
    }
}
