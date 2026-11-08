//! What the mirror view saw (a click, a drag, a wheel, a key) into scrcpy control messages. Pure:
//! the view reads AppKit's events into [`InputEvent`] and sends what [`InputTranslator`] answers.
//! Ports the event handling of `useMirrorInput.ts`.

use std::collections::{HashMap, HashSet};

use masaya_core::scrcpy::ControlMessage;
use masaya_core::scrcpy::control::MAX_TEXT_BYTES;

use super::keys::{self, KeyAction, Modifiers, akey};
use super::mapping::{self, VideoSize, ViewSize};
use super::scroll;

/// scrcpy's virtual pointer for the mouse.
pub const MOUSE_POINTER_ID: i64 = -1;
pub const KEYCODE_HOME: u32 = 3;

const MOTION_DOWN: u8 = 0;
const MOTION_UP: u8 = 1;
const MOTION_MOVE: u8 = 2;
const KEY_DOWN: u8 = 0;
const KEY_UP: u8 = 1;

/// Where the events happen: the view's size, the video's, and AppKit's `isFlipped`.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Geometry {
    pub view: ViewSize,
    pub video: VideoSize,
    pub flipped: bool,
}

/// One AppKit event, as plain values. Points are in the view's coordinates.
#[derive(Debug, Clone, PartialEq)]
pub enum InputEvent {
    MouseDown {
        x: f64,
        y: f64,
    },
    MouseDragged {
        x: f64,
        y: f64,
    },
    MouseUp {
        x: f64,
        y: f64,
    },
    /// Back, as in scrcpy.
    RightMouseDown,
    /// Home, as in scrcpy (the middle button).
    OtherMouseDown,
    Scroll {
        x: f64,
        y: f64,
        delta_x: f64,
        delta_y: f64,
        precise: bool,
    },
    /// `keyDown:` (`down`) or `keyUp:`; `characters` is `NSEvent::characters`, `flags` its
    /// `modifierFlags`.
    Key {
        down: bool,
        repeat: bool,
        key_code: u16,
        characters: String,
        flags: u64,
    },
    /// Text the input system composed (`insertText:`): accents, dead keys, IME.
    Text(String),
}

/// What [`InputTranslator::key_down`] wants the view to do with a key press.
#[derive(Debug, Clone, PartialEq)]
pub enum KeyDown {
    /// Sent as these messages.
    Send(Vec<ControlMessage>),
    /// Text, or a key that may be part of a composition: hand the event to the input system
    /// (`interpretKeyEvents:`), which answers with `insertText:`.
    Compose,
}

/// Keeps what spans several events: the mouse button held, and the keys pressed on the phone.
#[derive(Debug, Default)]
pub struct InputTranslator {
    /// The mouse went down on the video and has not come up (its drag is captured): where the
    /// finger last was, to lift it there if the view loses focus first.
    pressed: Option<((i32, i32), VideoSize)>,
    /// Keys pressed on the phone, by macOS key code, to release them on blur.
    held: HashMap<u16, (u32, u32)>,
    /// Keys whose press went to the input system: their release sends nothing.
    composed: HashSet<u16>,
}

fn touch(action: u8, (x, y): (i32, i32), video: VideoSize, pressure: f32) -> ControlMessage {
    ControlMessage::Touch {
        action,
        pointer_id: MOUSE_POINTER_ID,
        pointer_x: x,
        pointer_y: y,
        video_width: clamp_u16(video.width),
        video_height: clamp_u16(video.height),
        pressure,
        buttons: 0,
        action_button: 0,
    }
}

fn clamp_u16(value: u32) -> u16 {
    u16::try_from(value).unwrap_or(u16::MAX)
}

fn key(action: u8, key_code: u32, meta_state: u32, repeat: u32) -> ControlMessage {
    ControlMessage::Key {
        action,
        key_code,
        repeat,
        meta_state,
    }
}

/// A key down and up: the right and middle buttons, and the toolbar's device keys.
pub fn key_press(key_code: u32) -> Vec<ControlMessage> {
    vec![key(KEY_DOWN, key_code, 0, 0), key(KEY_UP, key_code, 0, 0)]
}

/// Text in pieces scrcpy accepts (at most [`MAX_TEXT_BYTES`] each), cut between characters.
fn text_messages(text: &str) -> Vec<ControlMessage> {
    let mut messages = Vec::new();
    let mut piece = String::new();
    for character in text.chars() {
        if piece.len() + character.len_utf8() > MAX_TEXT_BYTES {
            messages.push(ControlMessage::Text {
                text: std::mem::take(&mut piece),
            });
        }
        piece.push(character);
    }
    if !piece.is_empty() {
        messages.push(ControlMessage::Text { text: piece });
    }
    messages
}

impl InputTranslator {
    /// The messages for `event`. Keys go through [`Self::key_down`] / [`Self::key_up`] instead,
    /// since a press may need the input system first; here a key down that would compose sends
    /// nothing.
    pub fn translate(&mut self, event: &InputEvent, geometry: Geometry) -> Vec<ControlMessage> {
        let map = |x, y, captured| {
            mapping::map_point(
                (x, y),
                geometry.view,
                geometry.video,
                geometry.flipped,
                captured,
            )
        };
        match *event {
            InputEvent::MouseDown { x, y } => match map(x, y, false) {
                Some(point) => {
                    self.pressed = Some((point, geometry.video));
                    vec![touch(MOTION_DOWN, point, geometry.video, 1.0)]
                }
                // A press on a letterbox bar is not a touch.
                None => Vec::new(),
            },
            InputEvent::MouseDragged { x, y } if self.pressed.is_some() => match map(x, y, true) {
                Some(point) => {
                    self.pressed = Some((point, geometry.video));
                    vec![touch(MOTION_MOVE, point, geometry.video, 1.0)]
                }
                None => Vec::new(),
            },
            InputEvent::MouseUp { x, y } if self.pressed.is_some() => {
                let last = self.pressed.take();
                match map(x, y, true).or(last.map(|(point, _)| point)) {
                    Some(point) => vec![touch(MOTION_UP, point, geometry.video, 0.0)],
                    None => Vec::new(),
                }
            }
            InputEvent::MouseDragged { .. } | InputEvent::MouseUp { .. } => Vec::new(),
            InputEvent::RightMouseDown => key_press(akey::BACK),
            InputEvent::OtherMouseDown => key_press(KEYCODE_HOME),
            InputEvent::Scroll {
                x,
                y,
                delta_x,
                delta_y,
                precise,
            } => {
                let Some((pointer_x, pointer_y)) = map(x, y, false) else {
                    return Vec::new();
                };
                let (scroll_x, scroll_y) = scroll::wheel_to_notches(delta_x, delta_y, precise);
                if scroll_x == 0.0 && scroll_y == 0.0 {
                    return Vec::new();
                }
                vec![ControlMessage::Scroll {
                    pointer_x,
                    pointer_y,
                    video_width: clamp_u16(geometry.video.width),
                    video_height: clamp_u16(geometry.video.height),
                    scroll_x,
                    scroll_y,
                    buttons: 0,
                }]
            }
            InputEvent::Key {
                down: true,
                repeat,
                key_code,
                ref characters,
                flags,
            } => match self.key_down(key_code, characters, flags, repeat) {
                KeyDown::Send(messages) => messages,
                KeyDown::Compose => Vec::new(),
            },
            InputEvent::Key {
                down: false,
                key_code,
                ref characters,
                flags,
                ..
            } => self.key_up(key_code, characters, flags),
            InputEvent::Text(ref text) => text_messages(text),
        }
    }

    /// A key went down. A key code is sent (and remembered, to release on blur); anything that
    /// types goes to the input system, which may compose it with the next key.
    pub fn key_down(
        &mut self,
        key_code: u16,
        characters: &str,
        flags: u64,
        repeat: bool,
    ) -> KeyDown {
        let modifiers = Modifiers::from_flags(flags);
        match keys::resolve(key_code, characters, modifiers) {
            Some(KeyAction::KeyCode {
                key_code: android,
                meta_state,
            }) => {
                self.held.insert(key_code, (android, meta_state));
                KeyDown::Send(vec![key(KEY_DOWN, android, meta_state, u32::from(repeat))])
            }
            // Text, or a dead key (no characters yet): the input system decides.
            Some(KeyAction::Text(_)) | None => {
                self.composed.insert(key_code);
                KeyDown::Compose
            }
        }
    }

    /// A key came up: releases what its press sent; a composed key sends nothing.
    pub fn key_up(&mut self, key_code: u16, _characters: &str, _flags: u64) -> Vec<ControlMessage> {
        if self.composed.remove(&key_code) {
            return Vec::new();
        }
        match self.held.remove(&key_code) {
            Some((android, meta_state)) => vec![key(KEY_UP, android, meta_state, 0)],
            None => Vec::new(),
        }
    }

    /// The view lost the keyboard (the window went to the back, another view took focus): the
    /// key-ups and the mouse-up will never come, so a drag in progress lifts where the finger
    /// was and every key held on the phone is released. Ports the `blur` cleanup of
    /// `useMirrorInput.ts`.
    pub fn release_all(&mut self) -> Vec<ControlMessage> {
        let mut messages: Vec<ControlMessage> = self
            .pressed
            .take()
            .map(|(point, video)| touch(MOTION_UP, point, video, 0.0))
            .into_iter()
            .collect();
        let mut held: Vec<_> = self.held.drain().collect();
        held.sort_unstable_by_key(|(mac, _)| *mac);
        self.composed.clear();
        messages.extend(
            held.into_iter()
                .map(|(_, (android, meta_state))| key(KEY_UP, android, meta_state, 0)),
        );
        messages
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const GEOMETRY: Geometry = Geometry {
        // A 1000×1000 view with a 1080×2400 phone: content at x 275..725.
        view: ViewSize {
            width: 1000.0,
            height: 1000.0,
        },
        video: VideoSize {
            width: 1080,
            height: 2400,
        },
        flipped: false,
    };

    fn touch_at(action: u8, x: i32, y: i32, pressure: f32) -> ControlMessage {
        touch(action, (x, y), GEOMETRY.video, pressure)
    }

    #[test]
    fn a_click_is_a_touch_down_and_up_through_the_letterbox_with_y_flipped() {
        let mut input = InputTranslator::default();
        // Unflipped view: y 1000 is the top.
        let down = input.translate(
            &InputEvent::MouseDown {
                x: 500.0,
                y: 1000.0,
            },
            GEOMETRY,
        );
        assert_eq!(down, [touch_at(MOTION_DOWN, 540, 0, 1.0)]);
        let up = input.translate(
            &InputEvent::MouseUp {
                x: 500.0,
                y: 1000.0,
            },
            GEOMETRY,
        );
        assert_eq!(up, [touch_at(MOTION_UP, 540, 0, 0.0)]);
    }

    #[test]
    fn a_drag_off_the_video_keeps_going_until_it_lifts() {
        let mut input = InputTranslator::default();
        input.translate(&InputEvent::MouseDown { x: 500.0, y: 500.0 }, GEOMETRY);
        let moved = input.translate(&InputEvent::MouseDragged { x: 50.0, y: 500.0 }, GEOMETRY);
        assert_eq!(moved, [touch_at(MOTION_MOVE, -540, 1200, 1.0)]);
        let up = input.translate(&InputEvent::MouseUp { x: 50.0, y: 500.0 }, GEOMETRY);
        assert_eq!(up, [touch_at(MOTION_UP, -540, 1200, 0.0)]);
        // After the lift, drags are not touches.
        assert!(
            input
                .translate(&InputEvent::MouseDragged { x: 500.0, y: 500.0 }, GEOMETRY)
                .is_empty()
        );
    }

    #[test]
    fn a_press_on_a_bar_starts_nothing() {
        let mut input = InputTranslator::default();
        assert!(
            input
                .translate(&InputEvent::MouseDown { x: 100.0, y: 500.0 }, GEOMETRY)
                .is_empty()
        );
        assert!(
            input
                .translate(&InputEvent::MouseDragged { x: 500.0, y: 500.0 }, GEOMETRY)
                .is_empty()
        );
        assert!(
            input
                .translate(&InputEvent::MouseUp { x: 500.0, y: 500.0 }, GEOMETRY)
                .is_empty()
        );
    }

    #[test]
    fn right_is_back_and_middle_is_home() {
        let mut input = InputTranslator::default();
        assert_eq!(
            input.translate(&InputEvent::RightMouseDown, GEOMETRY),
            [key(KEY_DOWN, 4, 0, 0), key(KEY_UP, 4, 0, 0)]
        );
        assert_eq!(
            input.translate(&InputEvent::OtherMouseDown, GEOMETRY),
            [key(KEY_DOWN, 3, 0, 0), key(KEY_UP, 3, 0, 0)]
        );
    }

    #[test]
    fn the_wheel_scrolls_where_the_pointer_is() {
        let mut input = InputTranslator::default();
        let event = InputEvent::Scroll {
            x: 500.0,
            y: 500.0,
            delta_x: 0.0,
            delta_y: 100.0,
            precise: true,
        };
        assert_eq!(
            input.translate(&event, GEOMETRY),
            [ControlMessage::Scroll {
                pointer_x: 540,
                pointer_y: 1200,
                video_width: 1080,
                video_height: 2400,
                scroll_x: 0.0,
                scroll_y: 1.0,
                buttons: 0,
            }]
        );
        // Over a bar, or with nothing to scroll, nothing is sent.
        let scroll = |x: f64, delta_y: f64| InputEvent::Scroll {
            x,
            y: 500.0,
            delta_x: 0.0,
            delta_y,
            precise: true,
        };
        let bar = scroll(10.0, 100.0);
        assert!(input.translate(&bar, GEOMETRY).is_empty());
        let still = scroll(500.0, 0.0);
        assert!(input.translate(&still, GEOMETRY).is_empty());
    }

    fn key_event(down: bool, key_code: u16, characters: &str, flags: u64) -> InputEvent {
        InputEvent::Key {
            down,
            repeat: false,
            key_code,
            characters: characters.to_owned(),
            flags,
        }
    }

    #[test]
    fn special_keys_go_down_and_up_and_typing_goes_to_the_input_system() {
        let mut input = InputTranslator::default();
        // Return: a key code, down then up.
        assert_eq!(
            input.translate(&key_event(true, 0x24, "\r", 0), GEOMETRY),
            [key(KEY_DOWN, 66, 0, 0)]
        );
        assert_eq!(
            input.translate(&key_event(false, 0x24, "\r", 0), GEOMETRY),
            [key(KEY_UP, 66, 0, 0)]
        );
        // "a": composed by the input system, whose `insertText:` sends the text.
        assert_eq!(input.key_down(0x00, "a", 0, false), KeyDown::Compose);
        assert!(input.key_up(0x00, "a", 0).is_empty());
        assert_eq!(
            input.translate(&InputEvent::Text("á".to_owned()), GEOMETRY),
            [ControlMessage::Text {
                text: "á".to_owned()
            }]
        );
        // A dead key (no characters yet) also waits for the input system.
        assert_eq!(input.key_down(0x0E, "", 1 << 19, false), KeyDown::Compose);
    }

    #[test]
    fn a_shortcut_sends_the_key_with_its_meta_state() {
        let mut input = InputTranslator::default();
        assert_eq!(
            input.key_down(0x08, "c", 1 << 20, false),
            KeyDown::Send(vec![key(KEY_DOWN, 31, 0x30000, 0)])
        );
    }

    #[test]
    fn long_text_is_cut_between_characters() {
        let text = "ñ".repeat(200); // 400 bytes
        let messages = text_messages(&text);
        assert_eq!(messages.len(), 2);
        for message in &messages {
            let ControlMessage::Text { text } = message else {
                panic!("text")
            };
            assert!(text.len() <= MAX_TEXT_BYTES);
        }
    }

    #[test]
    fn losing_focus_releases_the_held_keys() {
        let mut input = InputTranslator::default();
        input.key_down(0x7E, "\u{F700}", 0, false); // Up
        input.key_down(0x33, "\u{7f}", 0, false); // Delete
        input.translate(&InputEvent::MouseDown { x: 500.0, y: 500.0 }, GEOMETRY);
        input.translate(&InputEvent::MouseDragged { x: 600.0, y: 500.0 }, GEOMETRY);
        // The finger lifts where it was, then the keys come up.
        assert_eq!(
            input.release_all(),
            [
                touch_at(MOTION_UP, 780, 1200, 0.0),
                key(KEY_UP, 67, 0, 0),
                key(KEY_UP, 19, 0, 0)
            ]
        );
        assert!(input.release_all().is_empty());
        // The drag ended too: a later drag is not a touch.
        assert!(
            input
                .translate(&InputEvent::MouseDragged { x: 500.0, y: 500.0 }, GEOMETRY)
                .is_empty()
        );
    }
}
