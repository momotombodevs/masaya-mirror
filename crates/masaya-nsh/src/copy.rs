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
