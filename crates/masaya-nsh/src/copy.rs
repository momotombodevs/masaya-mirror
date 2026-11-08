//! The texts with a parameter, in the app's language. Fixed texts are [`crate::i18n::t`].

use crate::i18n::{self, locale};

/// The screen reader's label of the video.
pub fn mirror_label(name: &str) -> String {
    i18n::mirror_label(name, locale())
}

/// The screen reader's label of a phone that opens.
pub fn open_label(name: &str) -> String {
    i18n::open_label(name, locale())
}

/// The screen reader's label of a phone that cannot open: its name, state and what to do.
pub fn unavailable_label(name: &str, status: &str, hint: Option<&str>) -> String {
    match hint {
        Some(hint) => format!("{name}, {status}. {hint}"),
        None => format!("{name}, {status}"),
    }
}

/// What the screen reader announces when the list changes state.
pub fn devices_announcement(count: usize) -> String {
    i18n::devices_announcement(count, locale())
}

/// The screen reader's label of a phone whose mirror window is open: pressing it shows the
/// window.
pub fn mirroring_label(name: &str) -> String {
    i18n::mirroring_label(name, locale())
}

/// Announced when a mirror window starts connecting.
pub fn mirror_connecting_announcement(name: &str) -> String {
    i18n::mirror_connecting_announcement(name, locale())
}

/// Announced once the video shows.
pub fn mirror_live_announcement(name: &str) -> String {
    i18n::mirror_live_announcement(name, locale())
}

/// A phone's window title and video name when the list shows ids, so two phones of the same
/// model can be told apart.
pub fn mirror_title(label: &str, id: &str) -> String {
    format!("{label} · {id}")
}

/// Announced when the stream drops and the reconnect starts.
pub fn reconnecting_announcement(name: &str) -> String {
    i18n::reconnecting_announcement(name, locale())
}

/// Announced when the reconnect gives up.
pub fn gave_up_announcement(name: &str) -> String {
    i18n::gave_up_announcement(name, locale())
}

/// Which reconnect attempt runs: "Intento 3 de 12".
pub fn reconnect_attempt(attempt: usize, max: usize) -> String {
    i18n::reconnect_attempt(attempt, max, locale())
}
