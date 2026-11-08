//! Range checks for options and control messages, ported from the removed Electron app's
//! `mirror-parsers.ts`: a message is checked here before it becomes bytes for the phone.

use super::control::{ControlMessage, MAX_TEXT_BYTES};
use super::options::MirrorOptions;

pub const MIN_MAX_SIZE: u32 = 256;
pub const MAX_MAX_SIZE: u32 = 8192;
pub const MIN_BIT_RATE: u32 = 1_000_000;
pub const MAX_BIT_RATE: u32 = 100_000_000;

const MAX_VIDEO_DIMENSION: i32 = 10_000;
const MAX_ANDROID_BUTTON_MASK: u32 = 0xffff;
const MAX_ANDROID_KEYCODE: u32 = 400;
const MAX_KEY_REPEAT: u32 = 100;
const MAX_META_STATE: u32 = 0xff_ffff;
/// Largest scroll, in notches, a single message may carry.
const MAX_SCROLL_NOTCHES: f32 = 10.0;

/// Names the first field that is out of range, without its value: a text message's content is
/// what the user typed and must not end up in logs.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
#[error("invalid {0}")]
pub struct Invalid(pub &'static str);

fn within(ok: bool, field: &'static str) -> Result<(), Invalid> {
    if ok {
        Ok(())
    } else {
        Err(Invalid(field))
    }
}

fn pointer(x: i32, y: i32, width: u16, height: u16, buttons: u32) -> Result<(), Invalid> {
    // A captured drag keeps reporting past the screen edge, so a pointer can be negative.
    // Rejecting it would drop the release and leave a finger held on the phone.
    let reach = -MAX_VIDEO_DIMENSION..=MAX_VIDEO_DIMENSION;
    within(reach.contains(&x), "pointerX")?;
    within(reach.contains(&y), "pointerY")?;
    within(
        (1..=MAX_VIDEO_DIMENSION).contains(&i32::from(width)),
        "videoWidth",
    )?;
    within(
        (1..=MAX_VIDEO_DIMENSION).contains(&i32::from(height)),
        "videoHeight",
    )?;
    within(buttons <= MAX_ANDROID_BUTTON_MASK, "buttons")
}

impl ControlMessage {
    pub fn validate(&self) -> Result<(), Invalid> {
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
                pointer(
                    *pointer_x,
                    *pointer_y,
                    *video_width,
                    *video_height,
                    *buttons,
                )?;
                within(*action <= 2, "action")?;
                // JavaScript numbers are exact only up to 2^53; -1 is the virtual mouse.
                within(*pointer_id < (1 << 53), "pointerId")?;
                within((0.0..=1.0).contains(pressure), "pressure")?;
                within(*action_button <= MAX_ANDROID_BUTTON_MASK, "actionButton")
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
                pointer(
                    *pointer_x,
                    *pointer_y,
                    *video_width,
                    *video_height,
                    *buttons,
                )?;
                let notches = -MAX_SCROLL_NOTCHES..=MAX_SCROLL_NOTCHES;
                within(notches.contains(scroll_x), "scrollX")?;
                within(notches.contains(scroll_y), "scrollY")
            }
            Self::Key {
                action,
                key_code,
                repeat,
                meta_state,
            } => {
                within(*action <= 1, "action")?;
                within(*key_code <= MAX_ANDROID_KEYCODE, "keyCode")?;
                within(*repeat <= MAX_KEY_REPEAT, "repeat")?;
                within(*meta_state <= MAX_META_STATE, "metaState")
            }
            Self::Text { text } => {
                within(!text.is_empty(), "text")?;
                within(text.len() <= MAX_TEXT_BYTES, "text")
            }
            Self::Rotate => Ok(()),
            // Only the app itself builds these (clipboard sync); the renderer cannot send them.
            Self::SetClipboard { .. } => Err(Invalid("type")),
        }
    }
}

impl MirrorOptions {
    pub fn validate(&self) -> Result<(), Invalid> {
        within(
            (MIN_MAX_SIZE..=MAX_MAX_SIZE).contains(&self.max_size),
            "maxSize",
        )?;
        within(
            (MIN_BIT_RATE..=MAX_BIT_RATE).contains(&self.video_bit_rate),
            "videoBitRate",
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn parse(value: serde_json::Value) -> Result<ControlMessage, Invalid> {
        let message: ControlMessage =
            serde_json::from_value(value).map_err(|_| Invalid("shape"))?;
        message.validate()?;
        Ok(message)
    }

    fn touch(patch: serde_json::Value) -> serde_json::Value {
        let mut base = json!({
            "type": "touch", "action": 0, "pointerId": 0, "pointerX": 10, "pointerY": 20,
            "videoWidth": 1080, "videoHeight": 2400, "pressure": 1, "buttons": 1, "actionButton": 1
        });
        base.as_object_mut()
            .unwrap()
            .extend(patch.as_object().unwrap().clone());
        base
    }

    #[test]
    fn a_normal_touch_is_accepted() {
        assert!(parse(touch(json!({}))).is_ok());
    }

    #[test]
    fn a_pointer_dragged_past_the_edge_is_still_accepted() {
        assert!(parse(touch(json!({ "pointerX": -50, "pointerY": 3000 }))).is_ok());
        assert!(parse(touch(json!({ "pointerId": -1 }))).is_ok());
    }

    #[test]
    fn out_of_range_touch_fields_name_the_culprit() {
        for (patch, field) in [
            (json!({ "pointerX": 10_001 }), "pointerX"),
            (json!({ "pointerY": -10_001 }), "pointerY"),
            (json!({ "videoWidth": 0 }), "videoWidth"),
            (json!({ "videoHeight": 10_001 }), "videoHeight"),
            (json!({ "action": 3 }), "action"),
            (json!({ "pressure": 1.5 }), "pressure"),
            (json!({ "buttons": 0x1_0000 }), "buttons"),
            (json!({ "actionButton": 0x1_0000 }), "actionButton"),
            (json!({ "pointerId": "a" }), "shape"),
        ] {
            assert_eq!(parse(touch(patch)), Err(Invalid(field)), "{field}");
        }
    }

    #[test]
    fn scroll_is_limited_to_ten_notches() {
        let scroll = |y: f64| {
            json!({
                "type": "scroll", "pointerX": 1, "pointerY": 1, "videoWidth": 100,
                "videoHeight": 100, "scrollX": 0, "scrollY": y, "buttons": 0
            })
        };
        assert!(parse(scroll(10.0)).is_ok());
        assert!(parse(scroll(-0.5)).is_ok());
        assert_eq!(parse(scroll(10.5)), Err(Invalid("scrollY")));
    }

    #[test]
    fn keys_are_range_checked() {
        let key = |code: u32, repeat: u32| json!({ "type": "key", "action": 0, "keyCode": code, "repeat": repeat, "metaState": 0 });
        assert!(parse(key(400, 100)).is_ok());
        assert_eq!(parse(key(401, 0)), Err(Invalid("keyCode")));
        assert_eq!(parse(key(4, 101)), Err(Invalid("repeat")));
    }

    #[test]
    fn text_must_be_non_empty_and_fit_the_server_limit() {
        assert!(parse(json!({ "type": "text", "text": "hola" })).is_ok());
        assert_eq!(
            parse(json!({ "type": "text", "text": "" })),
            Err(Invalid("text"))
        );
        // 2 bytes per "ñ" plus a 3-byte "€": 151 characters, 303 bytes.
        let long = "ñ".repeat(150) + "€";
        assert!(long.len() > MAX_TEXT_BYTES);
        assert_eq!(
            parse(json!({ "type": "text", "text": long })),
            Err(Invalid("text"))
        );
    }

    #[test]
    fn the_renderer_cannot_set_the_clipboard_through_the_control_channel() {
        let message = json!({ "type": "setClipboard", "text": "x", "paste": false, "sequence": 1 });
        assert!(parse(message).is_err());
    }

    #[test]
    fn mirror_options_follow_the_preference_ranges() {
        let mut options = MirrorOptions::default();
        assert!(options.validate().is_ok());
        options.max_size = 255;
        assert_eq!(options.validate(), Err(Invalid("maxSize")));
        options.max_size = 8192;
        options.video_bit_rate = 100_000_001;
        assert_eq!(options.validate(), Err(Invalid("videoBitRate")));
    }
}
