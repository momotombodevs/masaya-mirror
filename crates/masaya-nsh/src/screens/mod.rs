pub mod devices;
pub mod mirror;
pub mod toolbar;

use nsh_core::prelude::*;

use crate::settings::{Settings, SettingsHub};

/// The settings as a signal of this window's engine: it follows every change, whichever window
/// (or the menu) made it.
pub fn live_settings(hub: &SettingsHub) -> Signal<Settings> {
    // Subscribed before the first read, so a change in between is not missed.
    let mut changes = hub.subscribe();
    let settings = signal(changes.borrow_and_update().clone());
    spawn(async move {
        while changes.changed().await.is_ok() {
            let next = changes.borrow_and_update().clone();
            settings.set(next);
        }
    });
    settings
}
