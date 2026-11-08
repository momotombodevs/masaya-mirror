//! What every integration test sets up first, so no test reads or writes the user's files.

use std::path::PathBuf;
use std::sync::Once;

use masaya_nsh::i18n::{self, Locale};
use masaya_nsh::settings::{SETTINGS_PATH_ENV, SettingsHub};

/// Points the app's settings at a temp file (never created unless a test saves) and fixes the
/// language to Spanish, before anything reads either. Call it first in every test.
pub fn isolate() {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        let path = settings_path();
        // SAFETY: every test calls this before anything else, and `Once` holds the others back
        // until it returns, so no other thread reads the environment while it changes.
        unsafe { std::env::set_var(SETTINGS_PATH_ENV, &path) };
        i18n::set_locale(Locale::Es);
        assert_eq!(SettingsHub::global().path(), Some(path.as_path()));
    });
}

fn settings_path() -> PathBuf {
    std::env::temp_dir()
        .join(format!("masaya-nsh-tests-{}", std::process::id()))
        .join("settings.json")
}
