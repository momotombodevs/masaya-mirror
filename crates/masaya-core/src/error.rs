//! Failures of anything that talks to adb.

use std::io;

use crate::i18n::{Locale, Msg};
use crate::ipc::IpcResult;

#[derive(Debug, thiserror::Error)]
pub enum AdbError {
    /// No usable `adb` executable. The renderer offers the setup assistant for this one.
    #[error("adb not found")]
    NotFound,
    /// A command did not answer in time.
    #[error("adb timed out")]
    TimedOut,
    /// adb (or the device) answered with an error; the text is meant for the user.
    #[error("{0}")]
    Failed(String),
    #[error(transparent)]
    Io(#[from] io::Error),
}

impl AdbError {
    /// The text shown to the user, in their language.
    pub fn user_message(&self, locale: Locale) -> String {
        match self {
            Self::NotFound => crate::ipc::ADB_NOT_FOUND_MESSAGE.to_owned(),
            Self::TimedOut => Msg::AdbTimeout.text(locale),
            Self::Failed(message) if !message.is_empty() => message.clone(),
            Self::Failed(_) => Msg::AdbUnknown.text(locale),
            Self::Io(error) => error.to_string(),
        }
    }

    /// Same mapping as `commandFailure` in the removed Electron app.
    pub fn into_ipc<T>(self, locale: Locale) -> IpcResult<T> {
        match self {
            Self::NotFound => IpcResult::adb_not_found(),
            other => IpcResult::err(other.user_message(locale)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::ErrorCode;

    #[test]
    fn missing_adb_becomes_the_coded_failure() {
        let result: IpcResult<()> = AdbError::NotFound.into_ipc(Locale::Es);
        assert_eq!(
            result,
            IpcResult::Err {
                error: crate::ipc::ADB_NOT_FOUND_MESSAGE.to_owned(),
                code: Some(ErrorCode::AdbNotFound)
            }
        );
    }

    #[test]
    fn timeout_uses_the_translated_message() {
        let result: IpcResult<()> = AdbError::TimedOut.into_ipc(Locale::En);
        assert_eq!(
            result,
            IpcResult::err(
                "adb is not responding. Reconnect the phone, or run `adb kill-server` and try again."
            )
        );
    }

    #[test]
    fn empty_failure_text_falls_back_to_the_unknown_message() {
        assert_eq!(
            AdbError::Failed(String::new()).user_message(Locale::En),
            "Could not run adb."
        );
    }
}
