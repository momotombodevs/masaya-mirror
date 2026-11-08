//! Masaya as a native macOS app on NSH: `nsh.json` `"root"` names [`App`].

pub mod bench;
pub mod copy;
pub mod i18n;
pub mod input;
pub mod layout;
pub mod logging;
#[cfg(target_os = "macos")]
pub mod macos;
pub mod menu;
pub mod metrics;
pub mod mirror;
pub mod reconnect;
pub mod screens;
pub mod settings;
pub mod source;
pub mod state;
pub mod status;
pub mod store;
pub mod windows;

use std::collections::BTreeSet;
use std::sync::Arc;

use nsh_base::theme;
use nsh_core::prelude::*;

use crate::screens::devices::devices_screen;
use crate::source::AdbSource;
use crate::store::DevicesStore;
use crate::windows::OpenMirrors;

/// The bundle id (`nsh.json` `"id"`), which every window's engine runs under.
pub const APP_ID: &str = "dev.momotombo.app.masayamirror";

/// The app's UI set (`nsh.json` `"rust"`).
#[native_module("masaya/native")]
fn native(registry: &mut Registry) {
    registry.register::<App>();
}

/// The native views, for the hosts `nsh run` and `nsh package` build (`cargo run` registers
/// them in `main.rs`).
#[native_components(macos)]
fn components(components: &nsh_platform_macos::Components) {
    macos::register(components);
}

/// The main window: the device list. Each phone's mirror opens in a window of its own
/// ([`screens::mirror::MirrorWindow`]).
#[component]
pub fn App() -> impl IntoElement {
    let source: Arc<dyn source::DeviceSource> = Arc::new(AdbSource::new(i18n::locale()));
    let mirrors = OpenMirrors::global().clone();
    // `MASAYA_AUTO_OPEN=<serial>` (benchmarks): that phone's mirror opens at launch.
    if let Some(serial) = metrics::env_value(metrics::AUTO_OPEN_ENV) {
        mirrors.open_or_focus(&serial, &serial);
    }
    shell(source, mirrors)
}

/// The list with its device source and the windows it opens, so tests can give it fakes. The
/// list's state and its refresh live here.
pub fn shell(source: Arc<dyn source::DeviceSource>, mirrors: OpenMirrors) -> impl IntoElement {
    let devices = DevicesStore::start(source);
    // The phones with a window open, whichever thread their windows run on.
    // Subscribed before the first read, so a window that opens in between is not missed.
    let mut serials = mirrors.subscribe();
    // Device > Refresh List, from whichever window is key.
    let mut refreshes = mirrors.refresh_requests();
    {
        let devices = devices.clone();
        spawn(async move {
            while refreshes.changed().await.is_ok() {
                refreshes.borrow_and_update();
                devices.retry();
            }
        });
    }
    let mirroring = signal(serials.borrow_and_update().clone());
    {
        spawn(async move {
            while serials.changed().await.is_ok() {
                let open: BTreeSet<String> = serials.borrow_and_update().clone();
                mirroring.set(open);
            }
        });
    }
    view()
        .flex_1()
        .bg(move || theme().background)
        .child(devices_screen(devices, mirroring, move |id, label| {
            mirrors.open_or_focus(&id, &label);
        }))
}
