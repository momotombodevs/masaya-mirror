//! Where the app's log lines go: the terminal, as `env_logger` prints them (`RUST_LOG`), and a
//! file a bug report can attach, `~/Library/Logs/Masaya/nsh.log`. Ported from the removed
//! Electron app's `src/main/logging/log.ts` and `rotating-log.ts`:
//!
//! - The file is capped at 2 MB; before a write would pass it, `nsh.log` becomes `nsh.1.log`,
//!   `nsh.1.log` becomes `nsh.2.log`, and the oldest is dropped: three files, about 6 MB at most.
//! - The user's home folder is written as `~`: it carries their account name.
//! - A panic is written (message and location) before Rust's own hook prints it.
//!
//! The file keeps Masaya's own lines from `info` up and everyone else's from `warn` up, whatever
//! `RUST_LOG` says. Never log clipboard contents, typed text or anything else the user wrote;
//! device serials and file paths are fine.

use std::fs::{self, OpenOptions};
use std::io::{self, Write as _};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, TryLockError};
use std::time::{SystemTime, UNIX_EPOCH};

use log::{Level, LevelFilter, Metadata, Record};

/// The current file is rotated before a write would take it past this size.
pub const MAX_LOG_BYTES: u64 = 2 * 1024 * 1024;
/// Rotated files kept besides the current one.
pub const MAX_OLD_LOG_FILES: usize = 2;

/// An append-only log file with a size cap. Writes are synchronous, so the last lines before a
/// crash reach the disk, and they never fail: a full or read-only disk must not break the app.
pub struct RotatingLog {
    directory: PathBuf,
    /// `nsh` writes `nsh.log`, then rotates it to `nsh.1.log`, `nsh.2.log`…
    base_name: String,
    max_bytes: u64,
    max_old_files: usize,
    /// Size of the current file, read from disk on the first write.
    size: Option<u64>,
}

impl RotatingLog {
    pub fn new(
        directory: impl Into<PathBuf>,
        base_name: impl Into<String>,
        max_bytes: u64,
        max_old_files: usize,
    ) -> Self {
        Self {
            directory: directory.into(),
            base_name: base_name.into(),
            max_bytes,
            max_old_files,
            size: None,
        }
    }

    pub fn file_path(&self) -> PathBuf {
        self.file_at(0)
    }

    pub fn append(&mut self, text: &str) {
        if self.try_append(text).is_err() {
            // Nowhere left to report it; the app keeps working without a log.
            self.size = None;
        }
    }

    fn try_append(&mut self, text: &str) -> io::Result<()> {
        let bytes = text.len() as u64;
        let size = self.current_size()?;
        if size > 0 && size + bytes > self.max_bytes {
            self.rotate()?;
        }
        OpenOptions::new()
            .create(true)
            .append(true)
            .open(self.file_path())?
            .write_all(text.as_bytes())?;
        self.size = Some(self.size.unwrap_or(0) + bytes);
        Ok(())
    }

    fn file_at(&self, index: usize) -> PathBuf {
        let name = match index {
            0 => format!("{}.log", self.base_name),
            index => format!("{}.{index}.log", self.base_name),
        };
        self.directory.join(name)
    }

    fn current_size(&mut self) -> io::Result<u64> {
        if let Some(size) = self.size {
            return Ok(size);
        }
        fs::create_dir_all(&self.directory)?;
        let size = match fs::metadata(self.file_path()) {
            Ok(metadata) => metadata.len(),
            Err(error) if error.kind() == io::ErrorKind::NotFound => 0,
            Err(error) => return Err(error),
        };
        self.size = Some(size);
        Ok(size)
    }

    /// `nsh.1.log` → `nsh.2.log`, `nsh.log` → `nsh.1.log`; the oldest is overwritten.
    fn rotate(&mut self) -> io::Result<()> {
        for index in (0..self.max_old_files).rev() {
            let from = self.file_at(index);
            if from.exists() {
                fs::rename(from, self.file_at(index + 1))?;
            }
        }
        // With no old files to keep, the current one is simply started over.
        match fs::remove_file(self.file_path()) {
            Err(error) if error.kind() != io::ErrorKind::NotFound => return Err(error),
            _ => {}
        }
        self.size = Some(0);
        Ok(())
    }
}

/// The user's home folder carries their account name; `~` says the same for debugging.
pub fn redact_home(text: &str, home: &str) -> String {
    if home.len() > 1 {
        text.replace(home, "~")
    } else {
        text.to_owned()
    }
}

/// One entry per line, `2026-11-07T12:00:00.000Z INFO  [target] message`; continuation lines
/// (a multi-line message) are indented under it.
pub fn format_line(
    time: SystemTime,
    level: Level,
    target: &str,
    message: &str,
    home: &str,
) -> String {
    let body = redact_home(message, home)
        .replace("\r\n", "\n")
        .replace('\n', "\n    ");
    let level = level.as_str();
    format!("{} {level:<5} [{target}] {body}\n", iso_utc(time))
}

/// `SystemTime` as an ISO 8601 UTC timestamp with milliseconds, like JavaScript's `toISOString`.
pub fn iso_utc(time: SystemTime) -> String {
    let since_epoch = time.duration_since(UNIX_EPOCH).unwrap_or_default();
    let seconds = since_epoch.as_secs();
    let (days, seconds_of_day) = (seconds / 86_400, seconds % 86_400);
    let (year, month, day) = civil_from_days(days as i64);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{:03}Z",
        seconds_of_day / 3600,
        seconds_of_day / 60 % 60,
        seconds_of_day % 60,
        since_epoch.subsec_millis()
    )
}

/// Days since 1970-01-01 to a (year, month, day) date (Howard Hinnant's `civil_from_days`).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let day_of_era = z.rem_euclid(146_097);
    let year_of_era =
        (day_of_era - day_of_era / 1460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let year = year_of_era + era * 400 + i64::from(month <= 2);
    (year, month, day)
}

/// Which lines reach the file, whatever `RUST_LOG` says: Masaya's own (`masaya_nsh::…`,
/// `masaya_core::…`) from `info` up, everyone else's (NSH, the metrics) from `warn` up.
pub fn file_accepts(metadata: &Metadata) -> bool {
    let floor = if metadata.target().starts_with("masaya_") {
        Level::Info
    } else {
        Level::Warn
    };
    metadata.level() <= floor
}

/// The log file shared by the logger and the panic hook.
pub type SharedLog = Arc<Mutex<RotatingLog>>;

/// Writes `record` to the file when [`file_accepts`] it.
pub fn write_record(file: &SharedLog, home: &str, record: &Record) {
    if !file_accepts(record.metadata()) {
        return;
    }
    let line = format_line(
        SystemTime::now(),
        record.level(),
        record.target(),
        &record.args().to_string(),
        home,
    );
    file.lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .append(&line);
}

/// The text of a panic: its message and where it happened.
pub fn describe_panic(info: &std::panic::PanicHookInfo<'_>) -> String {
    let payload = info.payload();
    let message = payload
        .downcast_ref::<&str>()
        .copied()
        .or_else(|| payload.downcast_ref::<String>().map(String::as_str))
        .unwrap_or("(no message)");
    let thread = std::thread::current();
    let thread = thread.name().unwrap_or("unnamed");
    match info.location() {
        Some(location) => format!(
            "thread '{thread}' panicked at {}:{}:{}: {message}",
            location.file(),
            location.line(),
            location.column()
        ),
        None => format!("thread '{thread}' panicked: {message}"),
    }
}

/// Writes every panic to `file`, then runs the hook that was there before (which prints it).
pub fn install_panic_hook(file: SharedLog, home: String) {
    let previous = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let line = format_line(
            SystemTime::now(),
            Level::Error,
            "panic",
            &describe_panic(info),
            &home,
        );
        // `try_lock`: a panic while this thread is writing a line must not deadlock on it.
        match file.try_lock() {
            Ok(mut log) => log.append(&line),
            Err(TryLockError::Poisoned(poisoned)) => poisoned.into_inner().append(&line),
            Err(TryLockError::WouldBlock) => {}
        }
        previous(info);
    }));
}

/// `~/Library/Logs/Masaya`. `None` without a `$HOME`.
pub fn log_directory(home: &str) -> Option<PathBuf> {
    (!home.is_empty()).then(|| Path::new(home).join("Library").join("Logs").join("Masaya"))
}

fn home() -> String {
    std::env::var("HOME").unwrap_or_default()
}

/// The terminal (`env_logger`) and the file, as one logger.
#[cfg(target_os = "macos")]
struct AppLogger {
    terminal: env_logger::Logger,
    file: Option<SharedLog>,
    home: String,
}

#[cfg(target_os = "macos")]
impl log::Log for AppLogger {
    fn enabled(&self, metadata: &Metadata) -> bool {
        self.terminal.enabled(metadata) || (self.file.is_some() && file_accepts(metadata))
    }

    fn log(&self, record: &Record) {
        if self.terminal.matches(record) {
            self.terminal.log(record);
        }
        if let Some(file) = &self.file {
            write_record(file, &self.home, record);
        }
    }

    fn flush(&self) {
        self.terminal.flush();
    }
}

/// Starts logging to the terminal and to `~/Library/Logs/Masaya/nsh.log`, and installs the panic
/// hook. `metrics`: the measurements' lines reach the terminal whatever `RUST_LOG` says.
#[cfg(target_os = "macos")]
pub fn init(metrics: bool) {
    let mut terminal = env_logger::Builder::from_default_env();
    if metrics {
        terminal.filter_module("masaya::", LevelFilter::Info);
    }
    let terminal = terminal.build();
    let home = home();
    let file: Option<SharedLog> = log_directory(&home).map(|directory| {
        Arc::new(Mutex::new(RotatingLog::new(
            directory,
            "nsh",
            MAX_LOG_BYTES,
            MAX_OLD_LOG_FILES,
        )))
    });
    let max_level = terminal.filter().max(if file.is_some() {
        LevelFilter::Info
    } else {
        LevelFilter::Off
    });
    if let Some(file) = &file {
        install_panic_hook(file.clone(), home.clone());
    }
    let logger = AppLogger {
        terminal,
        file,
        home,
    };
    if log::set_boxed_logger(Box::new(logger)).is_ok() {
        log::set_max_level(max_level);
    }
    log::info!(
        "started: masaya-nsh {} ({} {})",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH
    );
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;
    use crate::settings::test_dir::TempDir;

    fn read(dir: &Path, name: &str) -> String {
        fs::read_to_string(dir.join("logs").join(name)).unwrap()
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(dir.join("logs"))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    fn create(dir: &TempDir, max_bytes: u64, max_old_files: usize) -> RotatingLog {
        RotatingLog::new(dir.path().join("logs"), "main", max_bytes, max_old_files)
    }

    #[test]
    fn creates_the_folder_and_appends() {
        let dir = TempDir::new("masaya-log");
        let mut log = create(&dir, 1_000, 2);
        log.append("one\n");
        log.append("two\n");
        assert_eq!(log.file_path(), dir.path().join("logs").join("main.log"));
        assert_eq!(read(dir.path(), "main.log"), "one\ntwo\n");
    }

    #[test]
    fn rotates_before_a_write_would_pass_the_size_cap() {
        let dir = TempDir::new("masaya-log");
        let mut log = create(&dir, 20, 2);
        log.append("aaaaaaaaa\n"); // 10 bytes
        log.append("bbbbbbbbb\n"); // 20 bytes: still fits
        log.append("ccccccccc\n"); // would be 30: rotates first
        assert_eq!(read(dir.path(), "main.1.log"), "aaaaaaaaa\nbbbbbbbbb\n");
        assert_eq!(read(dir.path(), "main.log"), "ccccccccc\n");
    }

    #[test]
    fn keeps_only_the_old_files_asked_for_dropping_the_oldest() {
        let dir = TempDir::new("masaya-log");
        let mut log = create(&dir, 5, 2);
        for line in ["111\n", "222\n", "333\n", "444\n"] {
            log.append(line);
        }
        assert_eq!(names(dir.path()), ["main.1.log", "main.2.log", "main.log"]);
        assert_eq!(read(dir.path(), "main.2.log"), "222\n");
        assert_eq!(read(dir.path(), "main.1.log"), "333\n");
        assert_eq!(read(dir.path(), "main.log"), "444\n");
    }

    #[test]
    fn starts_the_file_over_when_no_old_files_are_kept() {
        let dir = TempDir::new("masaya-log");
        let mut log = create(&dir, 5, 0);
        log.append("111\n");
        log.append("222\n");
        assert_eq!(names(dir.path()), ["main.log"]);
        assert_eq!(read(dir.path(), "main.log"), "222\n");
    }

    #[test]
    fn counts_a_file_left_by_a_previous_run_toward_the_cap() {
        let dir = TempDir::new("masaya-log");
        create(&dir, 1_000, 2).append(&format!("{}\n", "x".repeat(15)));
        let mut log = create(&dir, 20, 2);
        log.append("yyyyyyyyy\n");
        assert_eq!(
            read(dir.path(), "main.1.log"),
            format!("{}\n", "x".repeat(15))
        );
        assert_eq!(read(dir.path(), "main.log"), "yyyyyyyyy\n");
    }

    #[test]
    fn the_app_keeps_three_files_of_two_megabytes() {
        let dir = TempDir::new("masaya-log");
        let mut log = RotatingLog::new(
            dir.path().join("logs"),
            "nsh",
            MAX_LOG_BYTES,
            MAX_OLD_LOG_FILES,
        );
        let line = format!("{}\n", "z".repeat(64 * 1024 - 1));
        for _ in 0..(4 * 32 + 1) {
            log.append(&line);
        }
        assert_eq!(names(dir.path()), ["nsh.1.log", "nsh.2.log", "nsh.log"]);
        for name in names(dir.path()) {
            let size = fs::metadata(dir.path().join("logs").join(name))
                .unwrap()
                .len();
            assert!(size <= MAX_LOG_BYTES);
        }
    }

    #[test]
    fn never_fails_when_the_folder_cannot_be_created() {
        let dir = TempDir::new("masaya-log");
        fs::write(dir.path().join("logs"), "a file, not a folder").unwrap();
        let mut log = create(&dir, 1_000, 2);
        log.append("lost\n");
        log.append("lost again\n");
    }

    #[test]
    fn replaces_the_home_folder_with_a_tilde() {
        assert_eq!(
            redact_home(
                "could not read /Users/ana/Library/x and /Users/ana/y",
                "/Users/ana"
            ),
            "could not read ~/Library/x and ~/y"
        );
        // An empty or root home would replace every slash.
        assert_eq!(redact_home("/Users/ana/x", ""), "/Users/ana/x");
        assert_eq!(redact_home("/Users/ana/x", "/"), "/Users/ana/x");
    }

    #[test]
    fn formats_one_entry_per_line_with_continuations_indented() {
        let time = UNIX_EPOCH + Duration::from_millis(1_762_516_800_123);
        assert_eq!(
            format_line(
                time,
                Level::Warn,
                "masaya_nsh::store",
                "a\nb\r\nc at /Users/ana/x",
                "/Users/ana"
            ),
            "2025-11-07T12:00:00.123Z WARN  [masaya_nsh::store] a\n    b\n    c at ~/x\n"
        );
    }

    #[test]
    fn timestamps_are_utc_dates() {
        assert_eq!(iso_utc(UNIX_EPOCH), "1970-01-01T00:00:00.000Z");
        // A leap day and the end of a century year.
        assert_eq!(
            iso_utc(UNIX_EPOCH + Duration::from_secs(951_782_400)),
            "2000-02-29T00:00:00.000Z"
        );
        assert_eq!(
            iso_utc(UNIX_EPOCH + Duration::from_secs(4_102_444_799)),
            "2099-12-31T23:59:59.000Z"
        );
    }

    #[test]
    fn the_file_keeps_masaya_info_and_others_from_warn_up() {
        let accepts = |target: &str, level: Level| {
            file_accepts(&Metadata::builder().target(target).level(level).build())
        };
        assert!(accepts("masaya_nsh::store", Level::Info));
        assert!(accepts("masaya_core::adb", Level::Warn));
        assert!(!accepts("masaya_nsh::store", Level::Debug));
        assert!(!accepts("nsh_core::engine", Level::Info));
        assert!(accepts("nsh_core::engine", Level::Warn));
        // The per-second measurements stay in the terminal.
        assert!(!accepts(crate::metrics::TARGET, Level::Info));
    }

    #[test]
    fn writes_accepted_records_with_the_home_hidden() {
        let dir = TempDir::new("masaya-log");
        let file: SharedLog = Arc::new(Mutex::new(create(&dir, 1_000, 2)));
        let home = dir.path().to_string_lossy().into_owned();
        let path = format!("{home}/settings.json");
        write_record(
            &file,
            &home,
            &Record::builder()
                .target("masaya_nsh::settings")
                .level(Level::Error)
                .args(format_args!("could not save {path}"))
                .build(),
        );
        write_record(
            &file,
            &home,
            &Record::builder()
                .target("masaya_nsh::settings")
                .level(Level::Debug)
                .args(format_args!("dropped"))
                .build(),
        );
        let written = read(dir.path(), "main.log");
        assert!(
            written.ends_with(" ERROR [masaya_nsh::settings] could not save ~/settings.json\n"),
            "{written}"
        );
        assert!(!written.contains("dropped"));
        assert!(!written.contains(&home));
    }

    #[test]
    fn a_panic_is_written_with_its_location() {
        let dir = TempDir::new("masaya-log");
        let file: SharedLog = Arc::new(Mutex::new(create(&dir, 10_000, 2)));
        let home = dir.path().to_string_lossy().into_owned();
        // Only this test touches the process's panic hook.
        install_panic_hook(file, home.clone());
        let message = format!("boom in {home}/x");
        let result = std::thread::Builder::new()
            .name("worker".to_owned())
            .spawn(move || panic!("{message}"))
            .unwrap()
            .join();
        let _ = std::panic::take_hook();
        assert!(result.is_err());
        let written = read(dir.path(), "main.log");
        assert!(
            written.contains(" ERROR [panic] thread 'worker' panicked at "),
            "{written}"
        );
        assert!(written.contains("logging.rs:"), "{written}");
        assert!(written.contains(": boom in ~/x\n"), "{written}");
    }
}
