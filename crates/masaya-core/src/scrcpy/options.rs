//! Launching the scrcpy server on the phone.

use serde::{Deserialize, Serialize};

/// Must match the `scrcpy-server.jar` in `resources/scrcpy-server` (see `scripts/setup-scrcpy.sh`).
pub const SERVER_VERSION: &str = "3.3.3";
/// Where the jar is pushed on the device.
pub const SERVER_REMOTE_PATH: &str = "/data/local/tmp/scrcpy-server.jar";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VideoCodec {
    H264,
    H265,
}

impl VideoCodec {
    fn option_value(self) -> &'static str {
        match self {
            Self::H264 => "h264",
            Self::H265 => "h265",
        }
    }
}

/// What the user can tune. Same fields and defaults as the removed Electron app's `MirrorOptions`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MirrorOptions {
    /// Longest edge of the video, in pixels. 1920 is Full HD.
    pub max_size: u32,
    pub video_bit_rate: u32,
    pub video_codec: VideoCodec,
    pub audio_enabled: bool,
    /// Keeps the computer and device clipboards equal.
    pub clipboard_sync: bool,
}

impl Default for MirrorOptions {
    fn default() -> Self {
        Self {
            max_size: 1920,
            video_bit_rate: 16_000_000,
            video_codec: VideoCodec::H264,
            audio_enabled: false,
            clipboard_sync: true,
        }
    }
}

/// The abstract socket the server listens on: `scrcpy_` plus the session id as 8 hex digits.
pub fn socket_name(scid: u32) -> String {
    format!("scrcpy_{scid:08x}")
}

/// `key=value` arguments for the server. Everything is spelled out, defaults included, so a
/// change of the server's defaults cannot change what the app asks for.
///
/// The tunnel is always `forward`: the client connects to the device, which needs no reverse
/// tunnel support (and so works on every adb), and the server sends a dummy byte on the first
/// connection to say it is really listening.
pub fn server_args(scid: u32, options: &MirrorOptions) -> Vec<String> {
    let flag = |value: bool| if value { "true" } else { "false" };
    vec![
        format!("scid={scid:x}"),
        "log_level=info".to_owned(),
        "video=true".to_owned(),
        format!("audio={}", flag(options.audio_enabled)),
        "control=true".to_owned(),
        format!("video_codec={}", options.video_codec.option_value()),
        format!("video_bit_rate={}", options.video_bit_rate),
        format!("max_size={}", options.max_size),
        "tunnel_forward=true".to_owned(),
        "send_dummy_byte=true".to_owned(),
        "send_device_meta=true".to_owned(),
        "send_frame_meta=true".to_owned(),
        "send_codec_meta=true".to_owned(),
        format!("clipboard_autosync={}", flag(options.clipboard_sync)),
    ]
}

/// The shell command that starts the server, as the official client does: `CLASSPATH` in the
/// environment and `app_process` with a dummy parent directory.
pub fn launch_command(scid: u32, options: &MirrorOptions) -> String {
    let args = server_args(scid, options).join(" ");
    format!(
        "CLASSPATH={SERVER_REMOTE_PATH} app_process / com.genymobile.scrcpy.Server {SERVER_VERSION} {args}"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn socket_name_pads_the_session_id_to_eight_hex_digits() {
        assert_eq!(socket_name(0xabcd), "scrcpy_0000abcd");
        assert_eq!(socket_name(0x7fff_ffff), "scrcpy_7fffffff");
    }

    #[test]
    fn default_options_match_the_electron_defaults() {
        let options = MirrorOptions::default();
        assert_eq!(options.max_size, 1920);
        assert_eq!(options.video_bit_rate, 16_000_000);
        assert_eq!(options.video_codec, VideoCodec::H264);
        assert!(!options.audio_enabled);
        assert!(options.clipboard_sync);
    }

    #[test]
    fn launch_command_carries_the_version_and_every_option() {
        let command = launch_command(0xabcd, &MirrorOptions::default());
        assert!(command.starts_with(
            "CLASSPATH=/data/local/tmp/scrcpy-server.jar app_process / com.genymobile.scrcpy.Server 3.3.3 "
        ));
        for expected in [
            "scid=abcd",
            "audio=false",
            "control=true",
            "video_codec=h264",
            "video_bit_rate=16000000",
            "max_size=1920",
            "tunnel_forward=true",
            "send_dummy_byte=true",
            "send_device_meta=true",
            "send_frame_meta=true",
            "send_codec_meta=true",
            "clipboard_autosync=true",
        ] {
            assert!(
                command.contains(expected),
                "missing {expected} in {command}"
            );
        }
    }

    #[test]
    fn user_choices_change_the_matching_arguments() {
        let options = MirrorOptions {
            max_size: 1280,
            video_bit_rate: 8_000_000,
            video_codec: VideoCodec::H265,
            audio_enabled: true,
            clipboard_sync: false,
        };
        let args = server_args(1, &options);
        assert!(args.contains(&"video_codec=h265".to_owned()));
        assert!(args.contains(&"audio=true".to_owned()));
        assert!(args.contains(&"clipboard_autosync=false".to_owned()));
        assert!(args.contains(&"max_size=1280".to_owned()));
        assert!(args.contains(&"video_bit_rate=8000000".to_owned()));
    }

    #[test]
    fn no_argument_contains_whitespace_that_would_split_the_shell_command() {
        let args = server_args(1, &MirrorOptions::default());
        assert!(args.iter().all(|arg| !arg.contains(char::is_whitespace)));
    }

    #[test]
    fn options_deserialize_from_the_renderer_json_with_defaults_for_missing_fields() {
        let options: MirrorOptions =
            serde_json::from_str(r#"{"maxSize":1280,"videoCodec":"h265","audioEnabled":true}"#)
                .unwrap();
        assert_eq!(options.max_size, 1280);
        assert_eq!(options.video_codec, VideoCodec::H265);
        assert!(options.audio_enabled);
        assert_eq!(options.video_bit_rate, 16_000_000);
        assert!(options.clipboard_sync);
    }
}
