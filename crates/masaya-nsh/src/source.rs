//! Where the phones and their mirrors come from. The screens only see [`DeviceSource`], so tests
//! drive every state with a fake and the app uses adb and scrcpy.

use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;

use masaya_core::adb::{AdbCli, AdbServer, AndroidDevice};
use masaya_core::scrcpy::{MirrorOptions, ScrcpySession, StartConfig};
use masaya_core::{AdbError, ErrorCode, Locale, Msg};

use crate::mirror::server;

/// `adb start-server` can take a while the first time; it also tells early when adb is missing.
const START_SERVER_TIMEOUT: Duration = Duration::from_secs(15);

/// Why the list could not be read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LoadError {
    /// `Some(AdbNotFound)` when there is no adb to run: the screen tells how to install it.
    pub code: Option<ErrorCode>,
    /// The detail, meant for the user ([`AdbError::user_message`]).
    pub detail: String,
}

impl LoadError {
    pub fn from_adb(error: &AdbError, locale: Locale) -> Self {
        Self {
            code: matches!(error, AdbError::NotFound).then_some(ErrorCode::AdbNotFound),
            detail: error.user_message(locale),
        }
    }

    /// Any other failure, with its detail.
    pub fn other(detail: impl Into<String>) -> Self {
        Self {
            code: None,
            detail: detail.into(),
        }
    }
}

/// A list of phones, or why it could not be read.
pub type DevicesResult = Result<Vec<AndroidDevice>, LoadError>;

/// The future of one load. `Send`, so it runs off the engine thread (`nsh_core::background`).
pub type DevicesFuture = Pin<Box<dyn Future<Output = DevicesResult> + Send>>;

/// A started mirror, or the text to show the user.
pub type MirrorResult = Result<ScrcpySession, String>;

/// The future of a mirror start. `Send`: it runs off the engine thread.
pub type MirrorFuture = Pin<Box<dyn Future<Output = MirrorResult> + Send>>;

pub trait DeviceSource: Send + Sync + 'static {
    /// Lists the phones. `start_server` is true on the first load and on a retry, when adb may
    /// not be running yet; the 2 s refreshes skip it.
    fn list(self: Arc<Self>, start_server: bool) -> DevicesFuture;

    /// Starts mirroring the phone `serial`: pushes and starts the scrcpy server, connects video
    /// and control.
    fn start_mirror(self: Arc<Self>, serial: String) -> MirrorFuture;
}

/// What the spike asks scrcpy for: H.264 video only (no audio, no clipboard sync yet).
fn mirror_options() -> MirrorOptions {
    MirrorOptions {
        audio_enabled: false,
        clipboard_sync: false,
        ..MirrorOptions::default()
    }
}

/// The phones adb sees, through the `adb` executable.
pub struct AdbSource {
    adb: AdbCli,
}

impl AdbSource {
    pub fn new(locale: Locale) -> Self {
        Self {
            adb: AdbCli::new(locale),
        }
    }
}

impl DeviceSource for AdbSource {
    fn list(self: Arc<Self>, start_server: bool) -> DevicesFuture {
        Box::pin(async move {
            let locale = self.adb.locale();
            if start_server {
                self.adb
                    .run(&["start-server"], START_SERVER_TIMEOUT)
                    .await
                    .map_err(|error| LoadError::from_adb(&error, locale))?;
            }
            self.adb
                .list_devices()
                .await
                .map_err(|error| LoadError::from_adb(&error, locale))
        })
    }

    fn start_mirror(self: Arc<Self>, serial: String) -> MirrorFuture {
        Box::pin(async move {
            let locale = self.adb.locale();
            // `adb start-server` also tells early when adb is missing.
            self.adb
                .run(&["start-server"], START_SERVER_TIMEOUT)
                .await
                .map_err(|error| error.user_message(locale))?;
            let jar = server::server_jar()
                .map_err(|path| Msg::ScrcpyMissing(&path.to_string_lossy()).text(locale))?;
            ScrcpySession::start(
                &AdbServer::default(),
                &serial,
                &jar,
                &mirror_options(),
                StartConfig::default(),
            )
            .await
            .map_err(|error| error.user_message(locale))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_adb_keeps_its_code() {
        let error = LoadError::from_adb(&AdbError::NotFound, Locale::Es);
        assert_eq!(error.code, Some(ErrorCode::AdbNotFound));
        let error = LoadError::from_adb(&AdbError::TimedOut, Locale::Es);
        assert_eq!(error.code, None);
        assert!(!error.detail.is_empty());
    }
}
