//! The result shape every command answers with.
//!
//! It keeps the JSON shape of the removed Electron app's IPC results, so a caller branches on `ok`
//! and `code`:
//!
//! ```json
//! { "ok": true, "value": 1 }
//! { "ok": false, "error": "boom", "code": "ADB_NOT_FOUND" }
//! ```

use serde::ser::SerializeStruct;
use serde::{Serialize, Serializer};

/// Error text for a missing `adb`. The renderer matches on it to offer the setup assistant.
pub const ADB_NOT_FOUND_MESSAGE: &str =
    "ADB no encontrado. Instala platform-tools o define ADB_PATH.";

/// Machine-readable failure reasons the renderer may branch on instead of matching message text.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ErrorCode {
    #[serde(rename = "ADB_NOT_FOUND")]
    AdbNotFound,
}

/// Outcome of a command: a value, or a message for the user with an optional code.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IpcResult<T> {
    Ok(T),
    Err {
        error: String,
        code: Option<ErrorCode>,
    },
}

impl<T> IpcResult<T> {
    pub fn ok(value: T) -> Self {
        Self::Ok(value)
    }

    pub fn err(error: impl Into<String>) -> Self {
        Self::Err {
            error: error.into(),
            code: None,
        }
    }

    pub fn err_with_code(error: impl Into<String>, code: ErrorCode) -> Self {
        Self::Err {
            error: error.into(),
            code: Some(code),
        }
    }

    /// The failure for a missing `adb`, which the renderer recognises by its code.
    pub fn adb_not_found() -> Self {
        Self::err_with_code(ADB_NOT_FOUND_MESSAGE, ErrorCode::AdbNotFound)
    }

    pub fn is_ok(&self) -> bool {
        matches!(self, Self::Ok(_))
    }

    /// Transforms the value of a successful result; a failure passes through untouched.
    pub fn map<U>(self, f: impl FnOnce(T) -> U) -> IpcResult<U> {
        match self {
            Self::Ok(value) => IpcResult::Ok(f(value)),
            Self::Err { error, code } => IpcResult::Err { error, code },
        }
    }
}

impl<T, E: std::fmt::Display> From<Result<T, E>> for IpcResult<T> {
    fn from(result: Result<T, E>) -> Self {
        match result {
            Ok(value) => Self::Ok(value),
            Err(error) => Self::err(error.to_string()),
        }
    }
}

impl<T: Serialize> Serialize for IpcResult<T> {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        match self {
            Self::Ok(value) => {
                let mut state = serializer.serialize_struct("IpcResult", 2)?;
                state.serialize_field("ok", &true)?;
                state.serialize_field("value", value)?;
                state.end()
            }
            Self::Err { error, code } => {
                let mut state = serializer.serialize_struct("IpcResult", 3)?;
                state.serialize_field("ok", &false)?;
                state.serialize_field("error", error)?;
                if let Some(code) = code {
                    state.serialize_field("code", code)?;
                }
                state.end()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn success_serializes_like_the_typescript_result() {
        let value = serde_json::to_value(IpcResult::ok(json!({ "path": null }))).unwrap();
        assert_eq!(value, json!({ "ok": true, "value": { "path": null } }));
    }

    #[test]
    fn unit_success_serializes_value_as_null() {
        let value = serde_json::to_value(IpcResult::ok(())).unwrap();
        assert_eq!(value, json!({ "ok": true, "value": null }));
    }

    #[test]
    fn failure_omits_the_code_when_there_is_none() {
        let value = serde_json::to_value(IpcResult::<()>::err("boom")).unwrap();
        assert_eq!(value, json!({ "ok": false, "error": "boom" }));
    }

    #[test]
    fn missing_adb_carries_its_code_and_message() {
        let value = serde_json::to_value(IpcResult::<()>::adb_not_found()).unwrap();
        assert_eq!(
            value,
            json!({ "ok": false, "error": ADB_NOT_FOUND_MESSAGE, "code": "ADB_NOT_FOUND" })
        );
    }

    #[test]
    fn map_changes_only_the_success_value() {
        assert_eq!(IpcResult::ok(2).map(|n| n * 3), IpcResult::ok(6));
        let failed: IpcResult<i32> = IpcResult::adb_not_found();
        assert_eq!(failed.clone().map(|n| n + 1), IpcResult::adb_not_found());
    }

    #[test]
    fn std_results_convert_with_the_error_text() {
        let failed: IpcResult<u8> = Err::<u8, _>("nope").into();
        assert_eq!(failed, IpcResult::err("nope"));
    }
}
