//! Every fixed text the app shows, in Spanish and English. [`text`] matches every key with every
//! locale, so a missing translation does not compile. The wording comes from the removed Electron
//! app's `src/shared/i18n/messages.ts` where it had the same text, so users see the words they
//! already know.
//!
//! The language follows the `language` setting; `system` picks Spanish when the first macOS
//! preferred language is Spanish and English otherwise (Electron's `resolveLocale`).

use std::sync::atomic::{AtomicU8, Ordering};

pub use masaya_core::Locale;

use crate::settings::{Language, Settings, SettingsHub};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Key {
    DevicesTitle,
    Loading,
    EmptyTitle,
    EmptyHint,
    Refresh,
    AdbNotFound,
    ListFailed,
    Retry,
    StatusDevice,
    StatusOffline,
    StatusUnauthorized,
    StatusUnknown,
    HintUnauthorized,
    HintReconnect,
    Back,
    MirrorStarting,
    MirrorFailed,
    MirrorEnded,
    MirrorNoVideo,
    MirrorReconnect,
}

impl Key {
    /// Every key, for tests that walk the whole catalog.
    pub const ALL: [Key; 20] = [
        Key::DevicesTitle,
        Key::Loading,
        Key::EmptyTitle,
        Key::EmptyHint,
        Key::Refresh,
        Key::AdbNotFound,
        Key::ListFailed,
        Key::Retry,
        Key::StatusDevice,
        Key::StatusOffline,
        Key::StatusUnauthorized,
        Key::StatusUnknown,
        Key::HintUnauthorized,
        Key::HintReconnect,
        Key::Back,
        Key::MirrorStarting,
        Key::MirrorFailed,
        Key::MirrorEnded,
        Key::MirrorNoVideo,
        Key::MirrorReconnect,
    ];
}

/// The text of `key` in `locale`.
pub fn text(key: Key, locale: Locale) -> &'static str {
    use Locale::{En, Es};
    match (key, locale) {
        (Key::DevicesTitle, Es) => "Dispositivos",
        (Key::DevicesTitle, En) => "Devices",
        (Key::Loading, Es) => "Buscando dispositivos…",
        (Key::Loading, En) => "Looking for devices…",
        // devices.none
        (Key::EmptyTitle, Es) => "Sin dispositivos",
        (Key::EmptyTitle, En) => "No devices",
        (Key::EmptyHint, Es) => "Conecta un Android por USB y activa la depuración USB",
        (Key::EmptyHint, En) => "Connect an Android phone over USB and turn on USB debugging",
        (Key::Refresh, Es) => "Actualizar",
        (Key::Refresh, En) => "Refresh",
        (Key::AdbNotFound, Es) => {
            "No encontramos adb. Instálalo con `brew install android-platform-tools` y pulsa Reintentar."
        }
        (Key::AdbNotFound, En) => {
            "adb not found. Install it with `brew install android-platform-tools` and press Try again."
        }
        // devices.loadFailed
        (Key::ListFailed, Es) => "No se pudo cargar la lista de dispositivos.",
        (Key::ListFailed, En) => "Could not load the device list.",
        // common.retry
        (Key::Retry, Es) => "Reintentar",
        (Key::Retry, En) => "Try again",
        // devices.status.*
        (Key::StatusDevice, Es) => "Conectado",
        (Key::StatusDevice, En) => "Connected",
        (Key::StatusOffline, Es) => "Desconectado",
        (Key::StatusOffline, En) => "Offline",
        (Key::StatusUnauthorized, Es) => "Sin autorizar",
        (Key::StatusUnauthorized, En) => "Unauthorized",
        (Key::StatusUnknown, Es) => "Desconocido",
        (Key::StatusUnknown, En) => "Unknown",
        (Key::HintUnauthorized, Es) => {
            "Desbloquea el teléfono y toca Permitir en el aviso de depuración USB"
        }
        (Key::HintUnauthorized, En) => "Unlock the phone and tap Allow on the USB debugging prompt",
        (Key::HintReconnect, Es) => "Desconecta y vuelve a conectar el cable USB",
        (Key::HintReconnect, En) => "Unplug the USB cable and plug it back in",
        (Key::Back, Es) => "Volver",
        (Key::Back, En) => "Back",
        (Key::MirrorStarting, Es) => "Conectando con el teléfono…",
        (Key::MirrorStarting, En) => "Connecting to the phone…",
        // main.mirrorStartFailed
        (Key::MirrorFailed, Es) => "No se pudo iniciar la duplicación.",
        (Key::MirrorFailed, En) => "Could not start mirroring.",
        (Key::MirrorEnded, Es) => "La transmisión terminó.",
        (Key::MirrorEnded, En) => "The stream ended.",
        (Key::MirrorNoVideo, Es) => "No se pudo mostrar el video del teléfono.",
        (Key::MirrorNoVideo, En) => "Could not show the phone's video.",
        (Key::MirrorReconnect, Es) => "Reconectar",
        (Key::MirrorReconnect, En) => "Reconnect",
    }
}

/// The text of `key` in the app's language.
pub fn t(key: Key) -> &'static str {
    text(key, locale())
}

/// The screen reader's label of the video.
pub fn mirror_label(name: &str, locale: Locale) -> String {
    match locale {
        Locale::Es => format!("Pantalla de {name}"),
        Locale::En => format!("{name} screen"),
    }
}

/// The screen reader's label of a phone that opens (`devices.openNamed`).
pub fn open_label(name: &str, locale: Locale) -> String {
    match locale {
        Locale::Es => format!("Abrir {name}"),
        Locale::En => format!("Open {name}"),
    }
}

/// What the screen reader announces when the list changes state.
pub fn devices_announcement(count: usize, locale: Locale) -> String {
    match (count, locale) {
        (1, Locale::Es) => "1 dispositivo".to_owned(),
        (count, Locale::Es) => format!("{count} dispositivos"),
        (1, Locale::En) => "1 device".to_owned(),
        (count, Locale::En) => format!("{count} devices"),
    }
}

/// The language to show: the one picked, or the system's. `system_language` is a BCP 47 tag
/// like `"es-NI"`; any language other than Spanish gets English.
pub fn resolve_locale(preference: Language, system_language: &str) -> Locale {
    match preference {
        Language::Es => Locale::Es,
        Language::En => Locale::En,
        Language::System if system_language.to_ascii_lowercase().starts_with("es") => Locale::Es,
        Language::System => Locale::En,
    }
}

/// The first of the user's preferred languages in macOS (`NSLocale.preferredLanguages`), or an
/// empty string when there is none.
#[cfg(target_os = "macos")]
pub fn system_language() -> String {
    objc2_foundation::NSLocale::preferredLanguages()
        .firstObject()
        .map(|language| language.to_string())
        .unwrap_or_default()
}

#[cfg(not(target_os = "macos"))]
pub fn system_language() -> String {
    String::new()
}

const UNRESOLVED: u8 = 0;
const SPANISH: u8 = 1;
const ENGLISH: u8 = 2;

static CURRENT: AtomicU8 = AtomicU8::new(UNRESOLVED);

fn encode(locale: Locale) -> u8 {
    match locale {
        Locale::Es => SPANISH,
        Locale::En => ENGLISH,
    }
}

fn decode(value: u8) -> Option<Locale> {
    match value {
        SPANISH => Some(Locale::Es),
        ENGLISH => Some(Locale::En),
        _ => None,
    }
}

/// The app's language. Resolved from the saved settings and the system language on first use;
/// from then on it follows changes of the `language` setting.
///
/// TODO(F4): screens read their texts when they render, so a change of language shows only on
/// what renders next. Re-render the open windows when the locale changes.
pub fn locale() -> Locale {
    if let Some(locale) = decode(CURRENT.load(Ordering::Acquire)) {
        return locale;
    }
    let resolved = initial_locale();
    match CURRENT.compare_exchange(
        UNRESOLVED,
        encode(resolved),
        Ordering::AcqRel,
        Ordering::Acquire,
    ) {
        // Only the first resolution subscribes, so the observer is registered once.
        Ok(_) => {
            follow_settings();
            resolved
        }
        // Another thread resolved it, or `set_locale` ran, first: theirs stands.
        Err(current) => decode(current).unwrap_or(resolved),
    }
}

/// Changes the app's language for the texts read from now on. Called before the first
/// [`locale`] (tests do), it also stops the language from following the settings.
pub fn set_locale(locale: Locale) {
    CURRENT.store(encode(locale), Ordering::Release);
}

/// The language `settings` asks for on this Mac.
pub fn locale_for(settings: &Settings) -> Locale {
    resolve_locale(settings.language, &system_language())
}

/// Keeps the app's language in step with `hub`'s `language` setting.
pub fn follow_language(hub: &SettingsHub) {
    hub.observe(|settings| set_locale(locale_for(settings)));
}

#[cfg(not(test))]
fn initial_locale() -> Locale {
    SettingsHub::global().with_settings(locale_for)
}

#[cfg(not(test))]
fn follow_settings() {
    follow_language(SettingsHub::global());
}

/// Unit tests never read the user's settings: they see the default language, Spanish.
#[cfg(test)]
fn initial_locale() -> Locale {
    Locale::default()
}

#[cfg(test)]
fn follow_settings() {}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;

    /// Each key and the one after it: an exhaustive match, so a new key must be linked in here,
    /// and then [`Key::ALL`] must list it for `all_lists_every_key` to pass.
    fn next(key: Key) -> Option<Key> {
        Some(match key {
            Key::DevicesTitle => Key::Loading,
            Key::Loading => Key::EmptyTitle,
            Key::EmptyTitle => Key::EmptyHint,
            Key::EmptyHint => Key::Refresh,
            Key::Refresh => Key::AdbNotFound,
            Key::AdbNotFound => Key::ListFailed,
            Key::ListFailed => Key::Retry,
            Key::Retry => Key::StatusDevice,
            Key::StatusDevice => Key::StatusOffline,
            Key::StatusOffline => Key::StatusUnauthorized,
            Key::StatusUnauthorized => Key::StatusUnknown,
            Key::StatusUnknown => Key::HintUnauthorized,
            Key::HintUnauthorized => Key::HintReconnect,
            Key::HintReconnect => Key::Back,
            Key::Back => Key::MirrorStarting,
            Key::MirrorStarting => Key::MirrorFailed,
            Key::MirrorFailed => Key::MirrorEnded,
            Key::MirrorEnded => Key::MirrorNoVideo,
            Key::MirrorNoVideo => Key::MirrorReconnect,
            Key::MirrorReconnect => return None,
        })
    }

    #[test]
    fn all_lists_every_key() {
        let chain: Vec<Key> =
            std::iter::successors(Some(Key::DevicesTitle), |key| next(*key)).collect();
        assert_eq!(chain, Key::ALL);
    }

    #[test]
    fn system_follows_spanish_and_anything_else_is_english() {
        assert_eq!(resolve_locale(Language::System, "es-NI"), Locale::Es);
        assert_eq!(resolve_locale(Language::System, "es"), Locale::Es);
        assert_eq!(resolve_locale(Language::System, "ES-419"), Locale::Es);
        assert_eq!(resolve_locale(Language::System, "en-US"), Locale::En);
        assert_eq!(resolve_locale(Language::System, "fr-FR"), Locale::En);
        assert_eq!(resolve_locale(Language::System, "pt-BR"), Locale::En);
        assert_eq!(resolve_locale(Language::System, ""), Locale::En);
    }

    #[test]
    fn a_picked_language_ignores_the_system() {
        assert_eq!(resolve_locale(Language::Es, "en-US"), Locale::Es);
        assert_eq!(resolve_locale(Language::En, "es-NI"), Locale::En);
    }

    #[test]
    fn every_text_exists() {
        for locale in [Locale::Es, Locale::En] {
            for key in Key::ALL {
                assert!(
                    !text(key, locale).trim().is_empty(),
                    "{key:?} in {locale:?}"
                );
            }
        }
    }

    /// Where one screen shows several texts at once, each must be told apart.
    #[test]
    fn statuses_and_buttons_are_told_apart() {
        let groups = [
            &[
                Key::StatusDevice,
                Key::StatusOffline,
                Key::StatusUnauthorized,
                Key::StatusUnknown,
            ][..],
            &[Key::Refresh, Key::Retry, Key::Back, Key::MirrorReconnect][..],
        ];
        for locale in [Locale::Es, Locale::En] {
            for group in groups {
                let texts: HashSet<&str> = group.iter().map(|key| text(*key, locale)).collect();
                assert_eq!(texts.len(), group.len(), "{group:?} in {locale:?}");
            }
        }
    }

    #[test]
    fn english_is_a_translation_not_a_copy() {
        for key in Key::ALL {
            assert_ne!(text(key, Locale::Es), text(key, Locale::En), "{key:?}");
        }
    }

    #[test]
    fn the_retry_button_named_in_the_adb_hint_exists() {
        for locale in [Locale::Es, Locale::En] {
            assert!(text(Key::AdbNotFound, locale).contains(text(Key::Retry, locale)));
        }
    }

    #[test]
    fn labels_fill_in_their_parameter() {
        assert_eq!(mirror_label("Pixel 8", Locale::Es), "Pantalla de Pixel 8");
        assert_eq!(mirror_label("Pixel 8", Locale::En), "Pixel 8 screen");
        assert_eq!(open_label("Pixel 8", Locale::Es), "Abrir Pixel 8");
        assert_eq!(open_label("Pixel 8", Locale::En), "Open Pixel 8");
        assert_eq!(devices_announcement(1, Locale::Es), "1 dispositivo");
        assert_eq!(devices_announcement(3, Locale::Es), "3 dispositivos");
        assert_eq!(devices_announcement(1, Locale::En), "1 device");
        assert_eq!(devices_announcement(0, Locale::En), "0 devices");
    }

    #[test]
    fn unit_tests_default_to_spanish() {
        assert_eq!(locale(), Locale::Es);
        assert_eq!(t(Key::Retry), "Reintentar");
    }

    #[test]
    fn a_picked_language_wins_over_the_system_in_settings() {
        let mut settings = Settings {
            language: Language::En,
            ..Settings::default()
        };
        assert_eq!(locale_for(&settings), Locale::En);
        settings.language = Language::Es;
        assert_eq!(locale_for(&settings), Locale::Es);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn the_system_language_is_a_language_tag() {
        let language = system_language();
        assert!(language.is_empty() || language.chars().next().unwrap().is_ascii_alphabetic());
    }
}
