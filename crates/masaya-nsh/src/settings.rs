//! The user's settings: the same `settings.json` the removed Electron app wrote, read the way it
//! read it (`readPreferences` in `src/shared/preferences/parse.ts`, `PreferencesService` in
//! `src/main/features/preferences/preferences.service.ts`).
//!
//! - A field that is missing or has a bad value falls back to its default; the others are kept.
//! - The first version saved only a quality preset (`"quality": "balanced"`); it still loads.
//! - Keys this version does not know are kept and written back, so a newer version's settings
//!   survive a trip through an older one.
//! - Every write goes to a temp file beside `settings.json` and is renamed over it, so a crash
//!   never leaves half a file.
//!
//! [`SettingsHub`] is the one copy the whole process shares: every window reads it and can
//! subscribe to its changes.

use std::io::{self, Write as _};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use masaya_core::scrcpy::{MirrorOptions, VideoCodec};
use serde::Serialize;
use serde_json::{Map, Value};
use tokio::sync::watch;

pub const MIN_MAX_SIZE: u32 = 256;
pub const MAX_MAX_SIZE: u32 = 8192;
pub const MIN_BIT_RATE: u32 = 1_000_000;
pub const MAX_BIT_RATE: u32 = 100_000_000;

/// What happens right after taking a screenshot.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum CaptureAction {
    #[default]
    Preview,
    Copy,
    Save,
}

/// What the record button produces.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum RecordingFormat {
    #[default]
    Video,
    Gif,
}

/// The language the user picked: a fixed one, or the system's.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    #[default]
    System,
    Es,
    En,
}

/// The video settings a mirror starts with.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MirrorSettings {
    pub max_size: u32,
    pub video_bit_rate: u32,
    pub video_codec: VideoCodec,
}

impl Default for MirrorSettings {
    fn default() -> Self {
        let options = MirrorOptions::default();
        Self {
            max_size: options.max_size,
            video_bit_rate: options.video_bit_rate,
            video_codec: options.video_codec,
        }
    }
}

/// Everything `settings.json` holds. Same keys as Electron's `StoredSettings`.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub mirror: MirrorSettings,
    /// Back, Home and Recents under the screen.
    pub navigation_bar: bool,
    pub always_on_top: bool,
    /// Draws a dot in the mirror window where the mouse touches the screen.
    pub show_clicks: bool,
    pub capture_action: CaptureAction,
    pub recording_format: RecordingFormat,
    /// Plays the device audio (Android 11 or newer).
    pub audio: bool,
    /// Keeps the computer and device clipboards equal.
    pub clipboard_sync: bool,
    pub language: Language,
    /// The adb the user picked, when it is not the one on `PATH`.
    pub adb_path: Option<String>,
    /// Where screenshots and recordings are saved, when the user picked a folder.
    pub save_directory: Option<String>,
    /// Keys this version does not know, written back untouched.
    #[serde(flatten)]
    pub extra: Map<String, Value>,
}

impl Default for Settings {
    fn default() -> Self {
        let options = MirrorOptions::default();
        Self {
            mirror: MirrorSettings::default(),
            navigation_bar: true,
            always_on_top: false,
            show_clicks: true,
            capture_action: CaptureAction::default(),
            recording_format: RecordingFormat::default(),
            audio: options.audio_enabled,
            clipboard_sync: options.clipboard_sync,
            language: Language::default(),
            adb_path: None,
            save_directory: None,
            extra: Map::new(),
        }
    }
}

/// The keys [`Settings`] reads; everything else goes to [`Settings::extra`].
const KNOWN_KEYS: [&str; 11] = [
    "mirror",
    "navigationBar",
    "alwaysOnTop",
    "showClicks",
    "captureAction",
    "recordingFormat",
    "audio",
    "clipboardSync",
    "language",
    "adbPath",
    "saveDirectory",
];

impl Settings {
    /// Lenient, for a file on disk: keeps every valid field and falls back to the default for
    /// the rest. Anything that is not a JSON object gives the defaults.
    pub fn from_json(raw: &Value) -> Self {
        let defaults = Self::default();
        let Some(raw) = raw.as_object() else {
            return defaults;
        };
        let boolean =
            |key: &str, default: bool| raw.get(key).and_then(Value::as_bool).unwrap_or(default);
        Self {
            mirror: parse_mirror(raw.get("mirror"))
                .or_else(|| legacy_mirror(raw))
                .unwrap_or(defaults.mirror),
            navigation_bar: boolean("navigationBar", defaults.navigation_bar),
            always_on_top: boolean("alwaysOnTop", defaults.always_on_top),
            show_clicks: boolean("showClicks", defaults.show_clicks),
            capture_action: match raw.get("captureAction").and_then(Value::as_str) {
                Some("preview") => CaptureAction::Preview,
                Some("copy") => CaptureAction::Copy,
                Some("save") => CaptureAction::Save,
                _ => defaults.capture_action,
            },
            recording_format: match raw.get("recordingFormat").and_then(Value::as_str) {
                Some("video") => RecordingFormat::Video,
                Some("gif") => RecordingFormat::Gif,
                _ => defaults.recording_format,
            },
            audio: boolean("audio", defaults.audio),
            clipboard_sync: boolean("clipboardSync", defaults.clipboard_sync),
            language: match raw.get("language").and_then(Value::as_str) {
                Some("system") => Language::System,
                Some("es") => Language::Es,
                Some("en") => Language::En,
                _ => defaults.language,
            },
            adb_path: non_empty_string(raw.get("adbPath")),
            save_directory: non_empty_string(raw.get("saveDirectory")),
            extra: raw
                .iter()
                .filter(|(key, _)| !KNOWN_KEYS.contains(&key.as_str()))
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect(),
        }
    }

    pub fn to_json(&self) -> Value {
        // Only plain fields and a JSON map: serializing cannot fail.
        serde_json::to_value(self).unwrap_or_else(|_| Value::Object(Map::new()))
    }

    /// The same settings with every out-of-range value back at its default, as if read from disk.
    pub fn sanitized(&self) -> Self {
        Self::from_json(&self.to_json())
    }

    /// What scrcpy is asked for, from the saved video settings.
    pub fn mirror_options(&self) -> MirrorOptions {
        MirrorOptions {
            max_size: self.mirror.max_size,
            video_bit_rate: self.mirror.video_bit_rate,
            video_codec: self.mirror.video_codec,
            audio_enabled: self.audio,
            clipboard_sync: self.clipboard_sync,
        }
    }
}

fn integer_in_range(value: Option<&Value>, min: u32, max: u32) -> Option<u32> {
    // `as_u64` is `None` for negative and fractional numbers (`1920.5`), like `Number.isInteger`.
    let value = value?.as_u64()?;
    u32::try_from(value)
        .ok()
        .filter(|value| (min..=max).contains(value))
}

fn parse_mirror(value: Option<&Value>) -> Option<MirrorSettings> {
    let value = value?.as_object()?;
    Some(MirrorSettings {
        max_size: integer_in_range(value.get("maxSize"), MIN_MAX_SIZE, MAX_MAX_SIZE)?,
        video_bit_rate: integer_in_range(value.get("videoBitRate"), MIN_BIT_RATE, MAX_BIT_RATE)?,
        video_codec: match value.get("videoCodec").and_then(Value::as_str)? {
            "h264" => VideoCodec::H264,
            "h265" => VideoCodec::H265,
            _ => return None,
        },
    })
}

/// Settings written by the first version stored only a quality preset (`MIRROR_QUALITY_PRESETS`).
fn legacy_mirror(raw: &Map<String, Value>) -> Option<MirrorSettings> {
    let (max_size, video_bit_rate) = match raw.get("quality").and_then(Value::as_str)? {
        "balanced" => (1280, 8_000_000),
        "high" => (1920, 16_000_000),
        "max" => (2560, 32_000_000),
        _ => return None,
    };
    Some(MirrorSettings {
        max_size,
        video_bit_rate,
        ..MirrorSettings::default()
    })
}

fn non_empty_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_owned)
}

/// `~/Library/Application Support/Masaya/settings.json`, Electron's `userData` folder. `None`
/// without a `$HOME`.
pub fn default_path() -> Option<PathBuf> {
    let home = std::env::var_os("HOME").filter(|home| !home.is_empty())?;
    Some(
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("Masaya")
            .join("settings.json"),
    )
}

/// Reads `path`. No file is the normal first run; anything else is logged and gives defaults.
pub fn load(path: &Path) -> Settings {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Settings::default(),
        Err(error) => {
            log::error!("could not read the settings file, using defaults: {error}");
            return Settings::default();
        }
    };
    match serde_json::from_str::<Value>(&text) {
        Ok(raw) => Settings::from_json(&raw),
        Err(error) => {
            log::error!("the settings file is not valid JSON, using defaults: {error}");
            Settings::default()
        }
    }
}

/// Writes `settings` to `path` through a temp file in the same folder, renamed over it.
pub fn save(path: &Path, settings: &Settings) -> io::Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    std::fs::create_dir_all(dir)?;
    let mut temp_name = path.file_name().unwrap_or_default().to_os_string();
    temp_name.push(format!(".{}.tmp", std::process::id()));
    let temp = dir.join(temp_name);
    let result = (|| {
        let mut text =
            serde_json::to_string_pretty(&settings.to_json()).map_err(io::Error::other)?;
        text.push('\n');
        let mut file = std::fs::File::create(&temp)?;
        file.write_all(text.as_bytes())?;
        file.sync_all()?;
        std::fs::rename(&temp, path)
    })();
    if result.is_err() {
        // Best effort: the temp file may never have been created.
        let _ = std::fs::remove_file(&temp);
    }
    result
}

/// The process's settings, shared by every window. Cloning shares the same settings.
#[derive(Clone)]
pub struct SettingsHub {
    inner: Arc<HubInner>,
}

struct HubInner {
    /// `None`: kept in memory only (no `$HOME`, or a test).
    path: Option<PathBuf>,
    sender: watch::Sender<Settings>,
    /// One read-modify-write at a time, so two windows cannot lose each other's change.
    writing: Mutex<()>,
}

impl SettingsHub {
    /// Loads `path` (defaults when it is missing or unreadable) and saves every change to it.
    pub fn open(path: PathBuf) -> Self {
        let settings = load(&path);
        Self::with(Some(path), settings)
    }

    /// Settings that are never saved.
    pub fn in_memory(settings: Settings) -> Self {
        Self::with(None, settings)
    }

    fn with(path: Option<PathBuf>, settings: Settings) -> Self {
        Self {
            inner: Arc::new(HubInner {
                path,
                sender: watch::Sender::new(settings),
                writing: Mutex::new(()),
            }),
        }
    }

    /// The app's settings, from [`default_path`], loaded on first use.
    pub fn global() -> &'static SettingsHub {
        static GLOBAL: OnceLock<SettingsHub> = OnceLock::new();
        GLOBAL.get_or_init(|| match default_path() {
            Some(path) => Self::open(path),
            None => {
                log::warn!("no $HOME: settings are not saved");
                Self::in_memory(Settings::default())
            }
        })
    }

    pub fn get(&self) -> Settings {
        self.inner.sender.borrow().clone()
    }

    /// Reads one value without cloning the whole settings.
    pub fn with_settings<T>(&self, read: impl FnOnce(&Settings) -> T) -> T {
        read(&self.inner.sender.borrow())
    }

    /// Notified on every change, from any window.
    pub fn subscribe(&self) -> watch::Receiver<Settings> {
        self.inner.sender.subscribe()
    }

    /// Changes the settings, saves them and tells the subscribers. Out-of-range values go back to
    /// their defaults. A failed save is logged and the change stays in memory for this run.
    pub fn update(&self, change: impl FnOnce(&mut Settings)) -> Settings {
        let _writing = self
            .inner
            .writing
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let mut next = self.get();
        change(&mut next);
        let next = next.sanitized();
        if next == *self.inner.sender.borrow() {
            return next;
        }
        if let Some(path) = &self.inner.path
            && let Err(error) = save(path, &next)
        {
            log::error!("could not save the settings file: {error}");
        }
        self.inner.sender.send_replace(next.clone());
        next
    }
}

#[cfg(test)]
pub(crate) mod test_dir {
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};

    /// A fresh folder under the system temp folder, removed when dropped.
    pub struct TempDir(PathBuf);

    impl TempDir {
        pub fn new(prefix: &str) -> Self {
            static NEXT: AtomicU32 = AtomicU32::new(0);
            let path = std::env::temp_dir().join(format!(
                "{prefix}-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            let _ = std::fs::remove_dir_all(&path);
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        pub fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::test_dir::TempDir;
    use super::*;

    fn read_dir(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = std::fs::read_dir(dir)
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    fn read_json(path: &Path) -> Value {
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    /// What the Electron app wrote with every setting changed (`JSON.stringify(settings, null, 2)`).
    const ELECTRON_CURRENT: &str = r#"{
  "mirror": {
    "maxSize": 2560,
    "videoBitRate": 32000000,
    "videoCodec": "h265"
  },
  "navigationBar": false,
  "alwaysOnTop": true,
  "showClicks": false,
  "captureAction": "copy",
  "recordingFormat": "gif",
  "audio": true,
  "clipboardSync": false,
  "language": "en",
  "adbPath": "/opt/adb",
  "saveDirectory": "/Users/qa/Captures"
}"#;

    #[test]
    fn defaults_match_the_mirror_options_and_electron() {
        let settings = Settings::default();
        let options = MirrorOptions::default();
        assert_eq!(settings.mirror.max_size, options.max_size);
        assert_eq!(settings.mirror.video_bit_rate, options.video_bit_rate);
        assert_eq!(settings.mirror.video_codec, options.video_codec);
        assert_eq!(settings.audio, options.audio_enabled);
        assert_eq!(settings.clipboard_sync, options.clipboard_sync);
        assert_eq!(settings.mirror_options(), options);
        // `DEFAULT_PREFERENCES` in Electron.
        assert!(settings.navigation_bar);
        assert!(!settings.always_on_top);
        assert!(settings.show_clicks);
        assert_eq!(settings.capture_action, CaptureAction::Preview);
        assert_eq!(settings.recording_format, RecordingFormat::Video);
        assert_eq!(settings.language, Language::System);
        assert_eq!(settings.adb_path, None);
        assert_eq!(settings.save_directory, None);
    }

    #[test]
    fn anything_but_an_object_gives_the_defaults() {
        assert_eq!(Settings::from_json(&Value::Null), Settings::default());
        assert_eq!(Settings::from_json(&json!(7)), Settings::default());
        assert_eq!(
            Settings::from_json(&json!("navigationBar")),
            Settings::default()
        );
    }

    #[test]
    fn reads_every_field_electron_wrote() {
        let settings = Settings::from_json(&serde_json::from_str(ELECTRON_CURRENT).unwrap());
        assert_eq!(
            settings,
            Settings {
                mirror: MirrorSettings {
                    max_size: 2560,
                    video_bit_rate: 32_000_000,
                    video_codec: VideoCodec::H265,
                },
                navigation_bar: false,
                always_on_top: true,
                show_clicks: false,
                capture_action: CaptureAction::Copy,
                recording_format: RecordingFormat::Gif,
                audio: true,
                clipboard_sync: false,
                language: Language::En,
                adb_path: Some("/opt/adb".to_owned()),
                save_directory: Some("/Users/qa/Captures".to_owned()),
                extra: Map::new(),
            }
        );
    }

    #[test]
    fn electron_settings_round_trip_unchanged() {
        let raw: Value = serde_json::from_str(ELECTRON_CURRENT).unwrap();
        assert_eq!(Settings::from_json(&raw).to_json(), raw);
    }

    #[test]
    fn defaults_are_written_with_every_key_electron_wrote() {
        let written = Settings::default().to_json();
        let mut keys: Vec<&str> = written
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        keys.sort_unstable();
        let mut known = KNOWN_KEYS.to_vec();
        known.sort_unstable();
        assert_eq!(keys, known);
        assert_eq!(written["adbPath"], Value::Null);
        assert_eq!(
            written["mirror"],
            json!({ "maxSize": 1920, "videoBitRate": 16_000_000, "videoCodec": "h264" })
        );
    }

    #[test]
    fn keeps_valid_fields_and_drops_invalid_ones() {
        // From `preferences.service.test.ts`, except that unknown keys are now kept.
        let settings = Settings::from_json(&json!({
            "navigationBar": false,
            "alwaysOnTop": "yes",
            "captureAction": "explode",
            "mirror": { "maxSize": 10, "videoBitRate": 8_000_000, "videoCodec": "h264" },
            "adbPath": 42,
            "saveDirectory": "",
            "extra": true,
        }));
        let mut expected = Settings {
            navigation_bar: false,
            ..Settings::default()
        };
        expected.extra.insert("extra".to_owned(), json!(true));
        assert_eq!(settings, expected);
    }

    #[test]
    fn rejects_out_of_range_or_incomplete_video_settings() {
        let mirror = json!({ "maxSize": 1920, "videoBitRate": 16_000_000, "videoCodec": "h264" });
        let with = |key: &str, value: Value| {
            let mut mirror = mirror.clone();
            mirror[key] = value;
            Settings::from_json(&json!({ "mirror": mirror })).mirror
        };
        let defaults = MirrorSettings::default();
        assert_eq!(with("maxSize", json!(1280)).max_size, 1280);
        assert_eq!(with("maxSize", json!(100)), defaults);
        assert_eq!(with("maxSize", json!(1920.5)), defaults);
        assert_eq!(with("maxSize", json!(-1920)), defaults);
        assert_eq!(with("videoBitRate", json!(500_000_000)), defaults);
        assert_eq!(with("videoCodec", json!("vp9")), defaults);
        assert_eq!(
            Settings::from_json(&json!({ "mirror": { "maxSize": 1280 } })).mirror,
            defaults
        );
    }

    #[test]
    fn accepts_a_known_language_and_ignores_an_unknown_one() {
        assert_eq!(
            Settings::from_json(&json!({ "language": "es" })).language,
            Language::Es
        );
        assert_eq!(
            Settings::from_json(&json!({ "language": "en" })).language,
            Language::En
        );
        assert_eq!(
            Settings::from_json(&json!({ "language": "fr" })).language,
            Language::System
        );
    }

    #[test]
    fn migrates_the_quality_preset_saved_by_the_first_version() {
        let settings =
            Settings::from_json(&json!({ "quality": "balanced", "adbPath": "/opt/adb" }));
        assert_eq!(
            settings.mirror,
            MirrorSettings {
                max_size: 1280,
                video_bit_rate: 8_000_000,
                video_codec: VideoCodec::H264,
            }
        );
        assert_eq!(settings.adb_path.as_deref(), Some("/opt/adb"));
        assert_eq!(
            Settings::from_json(&json!({ "quality": "max" }))
                .mirror
                .max_size,
            2560
        );
        assert_eq!(
            Settings::from_json(&json!({ "quality": "ultra" })).mirror,
            MirrorSettings::default()
        );
    }

    #[test]
    fn prefers_the_new_video_settings_over_the_legacy_preset() {
        let settings = Settings::from_json(&json!({
            "quality": "max",
            "mirror": { "maxSize": 1280, "videoBitRate": 16_000_000, "videoCodec": "h264" },
        }));
        assert_eq!(settings.mirror.max_size, 1280);
    }

    #[test]
    fn unknown_keys_survive_a_round_trip() {
        let raw = json!({
            "navigationBar": false,
            "windowBounds": { "x": 10, "y": 20 },
            "futureFlag": [1, 2, 3],
        });
        let written = Settings::from_json(&raw).to_json();
        assert_eq!(written["windowBounds"], json!({ "x": 10, "y": 20 }));
        assert_eq!(written["futureFlag"], json!([1, 2, 3]));
        assert_eq!(written["navigationBar"], json!(false));
    }

    #[test]
    fn sanitizing_puts_out_of_range_values_back_to_their_defaults() {
        let mut settings = Settings::default();
        settings.mirror.max_size = 10;
        settings.adb_path = Some(String::new());
        assert_eq!(settings.sanitized(), Settings::default());
    }

    #[test]
    fn starts_with_defaults_when_there_is_no_file() {
        let dir = TempDir::new("masaya-settings");
        let hub = SettingsHub::open(dir.path().join("nested").join("settings.json"));
        assert_eq!(hub.get(), Settings::default());
        // Reading never writes.
        assert!(!dir.path().join("nested").exists());
    }

    #[test]
    fn persists_changes_across_instances_creating_the_folder() {
        let dir = TempDir::new("masaya-settings");
        let path = dir.path().join("nested").join("settings.json");
        let hub = SettingsHub::open(path.clone());
        hub.update(|settings| {
            settings.mirror = MirrorSettings {
                max_size: 2560,
                video_bit_rate: 32_000_000,
                video_codec: VideoCodec::H265,
            };
            settings.navigation_bar = false;
            settings.language = Language::En;
            settings.adb_path = Some("/opt/adb".to_owned());
        });
        let reloaded = SettingsHub::open(path);
        assert_eq!(reloaded.get(), hub.get());
        assert_eq!(reloaded.get().mirror.video_codec, VideoCodec::H265);
        assert_eq!(reloaded.get().adb_path.as_deref(), Some("/opt/adb"));
    }

    #[test]
    fn falls_back_to_defaults_for_a_corrupt_file() {
        let dir = TempDir::new("masaya-settings");
        let path = dir.path().join("settings.json");
        std::fs::write(&path, "{not json").unwrap();
        assert_eq!(SettingsHub::open(path.clone()).get(), Settings::default());
        // Nothing is written until a setting changes.
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "{not json");
    }

    #[test]
    fn a_change_keeps_unknown_keys_and_the_other_fields_on_disk() {
        let dir = TempDir::new("masaya-settings");
        let path = dir.path().join("settings.json");
        std::fs::write(
            &path,
            r#"{"alwaysOnTop": true, "quality": "high", "windowBounds": {"x": 1}, "language": "es"}"#,
        )
        .unwrap();
        let hub = SettingsHub::open(path.clone());
        hub.update(|settings| settings.capture_action = CaptureAction::Save);

        let written = read_json(&path);
        assert_eq!(written["captureAction"], json!("save"));
        assert_eq!(written["alwaysOnTop"], json!(true));
        assert_eq!(written["language"], json!("es"));
        assert_eq!(written["windowBounds"], json!({ "x": 1 }));
        assert_eq!(written["quality"], json!("high"));
        assert_eq!(written["mirror"]["maxSize"], json!(1920));
    }

    #[test]
    fn writes_through_a_temp_file_and_leaves_nothing_behind() {
        let dir = TempDir::new("masaya-settings");
        let path = dir.path().join("settings.json");
        SettingsHub::open(path.clone()).update(|settings| settings.navigation_bar = false);
        assert_eq!(read_dir(dir.path()), ["settings.json"]);
        assert_eq!(read_json(&path)["navigationBar"], json!(false));
    }

    #[test]
    fn cleans_up_its_temp_file_when_the_rename_fails() {
        let dir = TempDir::new("masaya-settings");
        let path = dir.path().join("settings.json");
        // A folder where the file belongs makes the rename fail after the temp file was written.
        std::fs::create_dir_all(&path).unwrap();
        assert!(save(&path, &Settings::default()).is_err());
        assert_eq!(read_dir(dir.path()), ["settings.json"]);
    }

    #[test]
    fn keeps_working_in_memory_when_the_file_cannot_be_written() {
        let dir = TempDir::new("masaya-settings");
        let blocker = dir.path().join("blocker");
        std::fs::write(&blocker, "a file, not a folder").unwrap();
        let hub = SettingsHub::open(blocker.join("settings.json"));
        hub.update(|settings| settings.navigation_bar = false);
        assert!(!hub.get().navigation_bar);
    }

    #[test]
    fn subscribers_in_other_windows_see_each_change() {
        let hub = SettingsHub::in_memory(Settings::default());
        let other_window = hub.clone();
        let mut changes = other_window.subscribe();
        assert!(!changes.has_changed().unwrap());

        hub.update(|settings| settings.always_on_top = true);
        assert!(changes.has_changed().unwrap());
        assert!(changes.borrow_and_update().always_on_top);
        assert!(other_window.get().always_on_top);

        // A change to the same value is not a change.
        hub.update(|settings| settings.always_on_top = true);
        assert!(!changes.has_changed().unwrap());
    }

    #[test]
    fn concurrent_updates_from_several_windows_all_land() {
        let dir = TempDir::new("masaya-settings");
        let path = dir.path().join("settings.json");
        let hub = SettingsHub::open(path.clone());
        let threads: Vec<_> = (0..4)
            .map(|index| {
                let hub = hub.clone();
                std::thread::spawn(move || {
                    hub.update(|settings| {
                        settings
                            .extra
                            .insert(format!("window{index}"), json!(index));
                    });
                })
            })
            .collect();
        for thread in threads {
            thread.join().unwrap();
        }
        let written = read_json(&path);
        for index in 0..4 {
            assert_eq!(written[format!("window{index}")], json!(index));
        }
    }
}
