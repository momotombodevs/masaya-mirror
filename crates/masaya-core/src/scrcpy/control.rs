//! Messages on the control socket: what the client injects into the phone, and what the phone
//! reports back (its clipboard).

use serde::Deserialize;
use tokio::io::{AsyncRead, AsyncReadExt};

use crate::error::AdbError;

/// scrcpy rejects text payloads longer than 300 bytes of UTF-8.
pub const MAX_TEXT_BYTES: usize = 300;
/// Largest clipboard the server accepts (256 KiB minus the message header).
pub const MAX_CLIPBOARD_BYTES: usize = (1 << 18) - 14;

mod kind {
    pub const INJECT_KEYCODE: u8 = 0;
    pub const INJECT_TEXT: u8 = 1;
    pub const INJECT_TOUCH: u8 = 2;
    pub const INJECT_SCROLL: u8 = 3;
    pub const SET_CLIPBOARD: u8 = 9;
    pub const ROTATE_DEVICE: u8 = 11;
}

/// Android `MotionEvent` actions scrcpy uses.
pub mod motion {
    pub const DOWN: u8 = 0;
    pub const UP: u8 = 1;
    pub const MOVE: u8 = 2;
}

/// The JSON shape is the renderer's `MirrorControlMessage`.
#[derive(Debug, Clone, PartialEq, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum ControlMessage {
    Touch {
        action: u8,
        /// Negative ids are scrcpy's virtual pointers (-1 is the mouse).
        pointer_id: i64,
        /// A captured drag keeps reporting past the screen edge, so these may be negative.
        pointer_x: i32,
        pointer_y: i32,
        video_width: u16,
        video_height: u16,
        /// 0 to 1.
        pressure: f32,
        buttons: u32,
        action_button: u32,
    },
    Scroll {
        pointer_x: i32,
        pointer_y: i32,
        video_width: u16,
        video_height: u16,
        /// In wheel notches: 1 scrolls as far as one notch of a mouse wheel.
        scroll_x: f32,
        scroll_y: f32,
        buttons: u32,
    },
    Key {
        action: u8,
        key_code: u32,
        repeat: u32,
        meta_state: u32,
    },
    Text {
        text: String,
    },
    /// Turns the device screen 90°, like the rotate button of the system navigation.
    Rotate,
    /// Sets the device clipboard. Not sent by the renderer; the clipboard sync uses it.
    SetClipboard {
        text: String,
        paste: bool,
        sequence: u64,
    },
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum EncodeError {
    #[error("text is longer than {MAX_TEXT_BYTES} bytes")]
    TextTooLong,
    #[error("clipboard is longer than {MAX_CLIPBOARD_BYTES} bytes")]
    ClipboardTooLong,
}

/// scrcpy's unsigned 16-bit fixed point for 0..=1. `1.0` is `0xffff`, not `0x10000`.
fn unsigned_fixed(value: f32) -> u16 {
    let value = value.clamp(0.0, 1.0);
    if value >= 1.0 {
        0xffff
    } else {
        (value * 65536.0) as u16
    }
}

/// scrcpy's signed 16-bit fixed point for -1..=1. `1.0` is `0x7fff`.
fn signed_fixed(value: f32) -> i16 {
    let value = value.clamp(-1.0, 1.0);
    if value >= 1.0 {
        0x7fff
    } else {
        (value * 32768.0) as i16
    }
}

fn put_position(out: &mut Vec<u8>, x: i32, y: i32, width: u16, height: u16) {
    out.extend_from_slice(&(x as u32).to_be_bytes());
    out.extend_from_slice(&(y as u32).to_be_bytes());
    out.extend_from_slice(&width.to_be_bytes());
    out.extend_from_slice(&height.to_be_bytes());
}

impl ControlMessage {
    /// Whether it is a pointer move, which the next one supersedes. A device that falls behind
    /// may drop these; presses, releases and typing are never dropped.
    pub fn is_touch_move(&self) -> bool {
        matches!(self, Self::Touch { action, .. } if *action == motion::MOVE)
    }

    pub fn encode(&self) -> Result<Vec<u8>, EncodeError> {
        let mut out = Vec::with_capacity(32);
        match self {
            Self::Touch {
                action,
                pointer_id,
                pointer_x,
                pointer_y,
                video_width,
                video_height,
                pressure,
                buttons,
                action_button,
            } => {
                out.push(kind::INJECT_TOUCH);
                out.push(*action);
                out.extend_from_slice(&(*pointer_id as u64).to_be_bytes());
                put_position(
                    &mut out,
                    *pointer_x,
                    *pointer_y,
                    *video_width,
                    *video_height,
                );
                out.extend_from_slice(&unsigned_fixed(*pressure).to_be_bytes());
                out.extend_from_slice(&action_button.to_be_bytes());
                out.extend_from_slice(&buttons.to_be_bytes());
            }
            Self::Scroll {
                pointer_x,
                pointer_y,
                video_width,
                video_height,
                scroll_x,
                scroll_y,
                buttons,
            } => {
                out.push(kind::INJECT_SCROLL);
                put_position(
                    &mut out,
                    *pointer_x,
                    *pointer_y,
                    *video_width,
                    *video_height,
                );
                // The server takes -1..1; 16 notches span that range.
                out.extend_from_slice(&signed_fixed(scroll_x / 16.0).to_be_bytes());
                out.extend_from_slice(&signed_fixed(scroll_y / 16.0).to_be_bytes());
                out.extend_from_slice(&buttons.to_be_bytes());
            }
            Self::Key {
                action,
                key_code,
                repeat,
                meta_state,
            } => {
                out.push(kind::INJECT_KEYCODE);
                out.push(*action);
                out.extend_from_slice(&key_code.to_be_bytes());
                out.extend_from_slice(&repeat.to_be_bytes());
                out.extend_from_slice(&meta_state.to_be_bytes());
            }
            Self::Text { text } => {
                if text.len() > MAX_TEXT_BYTES {
                    return Err(EncodeError::TextTooLong);
                }
                out.push(kind::INJECT_TEXT);
                out.extend_from_slice(&(text.len() as u32).to_be_bytes());
                out.extend_from_slice(text.as_bytes());
            }
            Self::Rotate => out.push(kind::ROTATE_DEVICE),
            Self::SetClipboard {
                text,
                paste,
                sequence,
            } => {
                if text.len() > MAX_CLIPBOARD_BYTES {
                    return Err(EncodeError::ClipboardTooLong);
                }
                out.push(kind::SET_CLIPBOARD);
                out.extend_from_slice(&sequence.to_be_bytes());
                out.push(u8::from(*paste));
                out.extend_from_slice(&(text.len() as u32).to_be_bytes());
                out.extend_from_slice(text.as_bytes());
            }
        }
        Ok(out)
    }
}

/// What the phone reports on the control socket.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceMessage {
    /// The device clipboard changed.
    Clipboard(String),
    /// The device applied a `SetClipboard` that asked for an acknowledgement.
    ClipboardAck(u64),
    /// Output of a simulated HID device. Not used by Masaya, but it must be read off the socket.
    UhidOutput { id: u16, data: Vec<u8> },
}

/// Largest device message body accepted, so a corrupt length cannot allocate gigabytes.
const MAX_DEVICE_MESSAGE: usize = 1 << 20;

/// Reads one device message; `None` when the socket closed between messages.
pub async fn read_device_message<R: AsyncRead + Unpin>(
    reader: &mut R,
) -> Result<Option<DeviceMessage>, AdbError> {
    let mut kind_byte = [0u8; 1];
    if reader.read(&mut kind_byte).await? == 0 {
        return Ok(None);
    }
    let invalid = |what: &str| AdbError::Failed(format!("invalid device message: {what}"));
    match kind_byte[0] {
        0 => {
            let len = reader.read_u32().await? as usize;
            if len > MAX_DEVICE_MESSAGE {
                return Err(invalid("clipboard too long"));
            }
            let mut text = vec![0u8; len];
            reader.read_exact(&mut text).await?;
            Ok(Some(DeviceMessage::Clipboard(
                String::from_utf8_lossy(&text).into_owned(),
            )))
        }
        1 => Ok(Some(DeviceMessage::ClipboardAck(reader.read_u64().await?))),
        2 => {
            let id = reader.read_u16().await?;
            let len = reader.read_u16().await? as usize;
            let mut data = vec![0u8; len];
            reader.read_exact(&mut data).await?;
            Ok(Some(DeviceMessage::UhidOutput { id, data }))
        }
        other => Err(invalid(&format!("unknown type {other}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(action: u8, pressure: f32) -> ControlMessage {
        ControlMessage::Touch {
            action,
            pointer_id: -1,
            pointer_x: 540,
            pointer_y: 960,
            video_width: 1080,
            video_height: 1920,
            pressure,
            buttons: 1,
            action_button: 0,
        }
    }

    #[test]
    fn touch_is_32_bytes_in_scrcpy_order() {
        let bytes = touch(motion::DOWN, 1.0).encode().unwrap();
        assert_eq!(bytes.len(), 32);
        assert_eq!(bytes[0], 2, "type");
        assert_eq!(bytes[1], 0, "action");
        assert_eq!(&bytes[2..10], &[0xff; 8], "pointer id -1 as u64");
        assert_eq!(&bytes[10..14], &540u32.to_be_bytes());
        assert_eq!(&bytes[14..18], &960u32.to_be_bytes());
        assert_eq!(&bytes[18..20], &1080u16.to_be_bytes());
        assert_eq!(&bytes[20..22], &1920u16.to_be_bytes());
        assert_eq!(&bytes[22..24], &[0xff, 0xff], "pressure 1.0");
        assert_eq!(&bytes[24..28], &0u32.to_be_bytes(), "action button");
        assert_eq!(&bytes[28..32], &1u32.to_be_bytes(), "buttons");
    }

    #[test]
    fn pressure_maps_zero_half_and_one() {
        assert_eq!(unsigned_fixed(0.0), 0);
        assert_eq!(unsigned_fixed(0.5), 0x8000);
        assert_eq!(unsigned_fixed(1.0), 0xffff);
        assert_eq!(unsigned_fixed(7.0), 0xffff);
        assert_eq!(unsigned_fixed(-1.0), 0);
    }

    #[test]
    fn a_pointer_past_the_screen_edge_is_sent_as_two_complement() {
        let message = ControlMessage::Touch {
            action: motion::MOVE,
            pointer_id: -1,
            pointer_x: -5,
            pointer_y: 0,
            video_width: 1080,
            video_height: 1920,
            pressure: 1.0,
            buttons: 0,
            action_button: 0,
        };
        let bytes = message.encode().unwrap();
        assert_eq!(&bytes[10..14], &[0xff, 0xff, 0xff, 0xfb]);
    }

    #[test]
    fn scroll_is_21_bytes_with_notches_scaled_by_sixteen() {
        let bytes = ControlMessage::Scroll {
            pointer_x: 10,
            pointer_y: 20,
            video_width: 1080,
            video_height: 1920,
            scroll_x: 0.0,
            scroll_y: -8.0,
            buttons: 0,
        }
        .encode()
        .unwrap();
        assert_eq!(bytes.len(), 21);
        assert_eq!(bytes[0], 3);
        assert_eq!(&bytes[13..15], &0i16.to_be_bytes());
        // -8 notches is -0.5, which is -0x4000.
        assert_eq!(&bytes[15..17], &(-0x4000i16).to_be_bytes());
    }

    #[test]
    fn scroll_extremes_saturate_like_the_official_client() {
        assert_eq!(signed_fixed(1.0), 0x7fff);
        assert_eq!(signed_fixed(16.0 / 16.0), 0x7fff);
        assert_eq!(signed_fixed(-1.0), -0x8000);
        assert_eq!(signed_fixed(100.0), 0x7fff);
        assert_eq!(signed_fixed(-100.0), -0x8000);
    }

    #[test]
    fn key_is_14_bytes() {
        let bytes = ControlMessage::Key {
            action: 0,
            key_code: 66,
            repeat: 0,
            meta_state: 0x1000,
        }
        .encode()
        .unwrap();
        assert_eq!(bytes, [0, 0, 0, 0, 0, 66, 0, 0, 0, 0, 0, 0, 0x10, 0]);
    }

    #[test]
    fn text_is_length_prefixed_utf8_and_capped_at_300_bytes() {
        let bytes = ControlMessage::Text { text: "añ".into() }.encode().unwrap();
        assert_eq!(bytes, [1, 0, 0, 0, 3, b'a', 0xc3, 0xb1]);

        let longest = "x".repeat(MAX_TEXT_BYTES);
        assert!(ControlMessage::Text { text: longest }.encode().is_ok());
        let too_long = "x".repeat(MAX_TEXT_BYTES + 1);
        assert_eq!(
            ControlMessage::Text { text: too_long }.encode(),
            Err(EncodeError::TextTooLong)
        );
        // 150 two-byte characters are 300 bytes: allowed; one more is not.
        assert!(ControlMessage::Text {
            text: "ñ".repeat(150)
        }
        .encode()
        .is_ok());
        assert!(ControlMessage::Text {
            text: "ñ".repeat(151)
        }
        .encode()
        .is_err());
    }

    #[test]
    fn rotate_is_a_single_byte() {
        assert_eq!(ControlMessage::Rotate.encode().unwrap(), [11]);
    }

    #[test]
    fn set_clipboard_carries_sequence_paste_flag_and_text() {
        let bytes = ControlMessage::SetClipboard {
            text: "hi".into(),
            paste: true,
            sequence: 7,
        }
        .encode()
        .unwrap();
        assert_eq!(
            bytes,
            [9, 0, 0, 0, 0, 0, 0, 0, 7, 1, 0, 0, 0, 2, b'h', b'i']
        );
    }

    #[test]
    fn only_move_touches_are_droppable() {
        assert!(touch(motion::MOVE, 1.0).is_touch_move());
        assert!(!touch(motion::DOWN, 1.0).is_touch_move());
        assert!(!touch(motion::UP, 0.0).is_touch_move());
        assert!(!ControlMessage::Rotate.is_touch_move());
    }

    #[test]
    fn deserializes_the_renderer_json() {
        let touch: ControlMessage = serde_json::from_str(
            r#"{"type":"touch","action":2,"pointerId":-1,"pointerX":-3,"pointerY":4,
                "videoWidth":1080,"videoHeight":1920,"pressure":0.5,"buttons":1,"actionButton":0}"#,
        )
        .unwrap();
        assert!(touch.is_touch_move());
        let key: ControlMessage = serde_json::from_str(
            r#"{"type":"key","action":1,"keyCode":4,"repeat":0,"metaState":0}"#,
        )
        .unwrap();
        assert_eq!(
            key,
            ControlMessage::Key {
                action: 1,
                key_code: 4,
                repeat: 0,
                meta_state: 0
            }
        );
        let rotate: ControlMessage = serde_json::from_str(r#"{"type":"rotate"}"#).unwrap();
        assert_eq!(rotate, ControlMessage::Rotate);
        assert!(serde_json::from_str::<ControlMessage>(r#"{"type":"explode"}"#).is_err());
    }

    #[tokio::test]
    async fn reads_device_messages() {
        let mut bytes: &[u8] = &[
            0, 0, 0, 0, 2, b'o', b'k', // clipboard "ok"
            1, 0, 0, 0, 0, 0, 0, 0, 9, // ack 9
            2, 0, 5, 0, 2, 0xaa, 0xbb, // uhid output
        ];
        assert_eq!(
            read_device_message(&mut bytes).await.unwrap(),
            Some(DeviceMessage::Clipboard("ok".into()))
        );
        assert_eq!(
            read_device_message(&mut bytes).await.unwrap(),
            Some(DeviceMessage::ClipboardAck(9))
        );
        assert_eq!(
            read_device_message(&mut bytes).await.unwrap(),
            Some(DeviceMessage::UhidOutput {
                id: 5,
                data: vec![0xaa, 0xbb]
            })
        );
        assert_eq!(read_device_message(&mut bytes).await.unwrap(), None);
    }

    #[tokio::test]
    async fn rejects_unknown_types_and_absurd_lengths() {
        let mut unknown: &[u8] = &[9];
        assert!(read_device_message(&mut unknown).await.is_err());
        let mut huge: &[u8] = &[0, 0xff, 0xff, 0xff, 0xff];
        assert!(read_device_message(&mut huge).await.is_err());
    }
}
