//! Masaya as a native macOS app on NSH: `nsh.json` `"root"` names [`App`].

pub mod bench;
pub mod copy;
pub mod i18n;
pub mod input;
pub mod logging;
#[cfg(target_os = "macos")]
pub mod macos;
pub mod metrics;
pub mod mirror;
pub mod screens;
pub mod settings;
pub mod source;
pub mod state;
pub mod store;

use std::sync::Arc;

use nsh_base::theme;
use nsh_core::prelude::*;

use crate::screens::{devices::devices_screen, mirror::mirror_screen};
use crate::source::AdbSource;
use crate::state::Route;
use crate::store::DevicesStore;

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

/// The window: the device list, or the mirror of the phone opened from it.
#[component]
pub fn App() -> impl IntoElement {
    let source: Arc<dyn source::DeviceSource> = Arc::new(AdbSource::new(i18n::locale()));
    shell(source)
}

/// The app with its device source, so tests can give it a fake one. The list's state and its
/// refresh live here, above the screens, so coming back from the mirror keeps the list.
pub fn shell(source: Arc<dyn source::DeviceSource>) -> impl IntoElement {
    // `MASAYA_AUTO_OPEN=<serial>` (benchmarks): straight to that phone's mirror.
    let route = signal(match metrics::env_value(metrics::AUTO_OPEN_ENV) {
        Some(serial) => Route::Mirror {
            id: serial.clone(),
            label: serial,
        },
        None => Route::Devices,
    });
    let devices = DevicesStore::start(source.clone());
    view()
        .flex_1()
        .bg(move || theme().background)
        .child(dynamic(move || match route.get() {
            Route::Devices => devices_screen(devices.clone(), move |id, label| {
                route.set(Route::Mirror { id, label });
            })
            .into_element(),
            Route::Mirror { id, label } => {
                mirror_screen(source.clone(), id, label, move || route.set(Route::Devices))
                    .into_element()
            }
        }))
}
