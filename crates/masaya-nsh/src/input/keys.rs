//! macOS key presses into Android key events or text. Ports `android-keycodes.ts`: the renderer
//! read DOM `KeyboardEvent.code`; here the input is `NSEvent::keyCode` (a `kVK_*` virtual key,
//! the physical key whatever the layout) and `NSEvent::characters`.
//!
//! Escape is Android's Back here (the renderer kept Escape for the window itself), and forward
//! delete is mapped too.
//!
//! Not covered yet (slice 4):
//! - Composed text (dead keys, accents, IME) is not resolved here: `keyDown:` only sees the
//!   final characters of a simple press. Text input will go through `NSTextInputClient`
//!   (`insertText:`), and [`resolve`] only decides key codes and single-character text.
//! - Releasing held keys when the window loses focus (`useMirrorInput.ts`, the `blur` cleanup)
//!   still has to be ported where the events are handled.

/// Android `KeyEvent` key codes used here.
pub mod akey {
    pub const BACK: u32 = 4;
    pub const DIGIT_0: u32 = 7;
    pub const DPAD_UP: u32 = 19;
    pub const DPAD_DOWN: u32 = 20;
    pub const DPAD_LEFT: u32 = 21;
    pub const DPAD_RIGHT: u32 = 22;
    pub const A: u32 = 29;
    pub const TAB: u32 = 61;
    pub const SPACE: u32 = 62;
    pub const ENTER: u32 = 66;
    pub const DEL: u32 = 67;
    pub const FORWARD_DEL: u32 = 112;
}

/// Android meta-state bits (`KeyEvent.META_*`), with the left-side variants, as the renderer.
const META_SHIFT: u32 = 0x01 | 0x40;
const META_ALT: u32 = 0x02 | 0x10;
const META_CTRL: u32 = 0x1000 | 0x2000;
const META_META: u32 = 0x10000 | 0x20000;

/// `NSEventModifierFlags` bits.
const NS_SHIFT: u64 = 1 << 17;
const NS_CONTROL: u64 = 1 << 18;
const NS_OPTION: u64 = 1 << 19;
const NS_COMMAND: u64 = 1 << 20;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct Modifiers {
    pub shift: bool,
    pub control: bool,
    pub option: bool,
    pub command: bool,
}

impl Modifiers {
    /// From `NSEvent::modifierFlags`.
    pub fn from_flags(flags: u64) -> Self {
        Self {
            shift: flags & NS_SHIFT != 0,
            control: flags & NS_CONTROL != 0,
            option: flags & NS_OPTION != 0,
            command: flags & NS_COMMAND != 0,
        }
    }

    /// Android's meta state. Option is Alt and Command is Meta.
    pub fn meta_state(self) -> u32 {
        let mut state = 0;
        if self.shift {
            state |= META_SHIFT;
        }
        if self.option {
            state |= META_ALT;
        }
        if self.control {
            state |= META_CTRL;
        }
        if self.command {
            state |= META_META;
        }
        state
    }
}

/// The Android key code of a `kVK_*` virtual key: letters, digits, Enter, Delete, Tab, Space,
/// the arrows and Escape (Back). `None` for the rest, which are ignored.
pub fn android_keycode(mac_key_code: u16) -> Option<u32> {
    // kVK_ANSI_A … kVK_ANSI_Z are not in alphabetical order.
    const LETTERS: [(u16, u8); 26] = [
        (0x00, b'A'),
        (0x0B, b'B'),
        (0x08, b'C'),
        (0x02, b'D'),
        (0x0E, b'E'),
        (0x03, b'F'),
        (0x05, b'G'),
        (0x04, b'H'),
        (0x22, b'I'),
        (0x26, b'J'),
        (0x28, b'K'),
        (0x25, b'L'),
        (0x2E, b'M'),
        (0x2D, b'N'),
        (0x1F, b'O'),
        (0x23, b'P'),
        (0x0C, b'Q'),
        (0x0F, b'R'),
        (0x01, b'S'),
        (0x11, b'T'),
        (0x20, b'U'),
        (0x09, b'V'),
        (0x0D, b'W'),
        (0x07, b'X'),
        (0x10, b'Y'),
        (0x06, b'Z'),
    ];
    // kVK_ANSI_0 … kVK_ANSI_9.
    const DIGITS: [u16; 10] = [0x1D, 0x12, 0x13, 0x14, 0x15, 0x17, 0x16, 0x1A, 0x1C, 0x19];

    if let Some((_, letter)) = LETTERS.iter().find(|(code, _)| *code == mac_key_code) {
        return Some(akey::A + u32::from(letter - b'A'));
    }
    if let Some(digit) = DIGITS.iter().position(|code| *code == mac_key_code) {
        // At most 9, so the cast cannot truncate.
        return Some(akey::DIGIT_0 + digit as u32);
    }
    match mac_key_code {
        0x24 | 0x4C => Some(akey::ENTER), // Return, keypad Enter
        0x33 => Some(akey::DEL),          // Delete (backspace)
        0x75 => Some(akey::FORWARD_DEL),  // Forward delete
        0x30 => Some(akey::TAB),
        0x31 => Some(akey::SPACE),
        0x35 => Some(akey::BACK), // Escape
        0x7B => Some(akey::DPAD_LEFT),
        0x7C => Some(akey::DPAD_RIGHT),
        0x7D => Some(akey::DPAD_DOWN),
        0x7E => Some(akey::DPAD_UP),
        _ => None,
    }
}

/// How a key press reaches the phone.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum KeyAction {
    /// Injected as text, so accents and symbols of any layout arrive as typed.
    Text(String),
    /// Sent as a key down and up with the meta state.
    KeyCode { key_code: u32, meta_state: u32 },
}

/// One character the user can see: not a control character, nor AppKit's function-key range
/// (U+F700–U+F8FF), where the arrows and the like live.
fn printable(characters: &str) -> Option<char> {
    let mut chars = characters.chars();
    let only = chars.next()?;
    if chars.next().is_some() || only.is_control() || ('\u{F700}'..='\u{F8FF}').contains(&only) {
        return None;
    }
    Some(only)
}

/// Ports `resolveKeyInput`: a printable character without a Control or Command shortcut is text;
/// anything else is a key code with the modifiers, or `None` when the key has no Android code.
/// `characters` is `NSEvent::characters`: empty while a dead key waits for the next one, which
/// sends nothing yet (the renderer's `Dead`).
pub fn resolve(mac_key_code: u16, characters: &str, modifiers: Modifiers) -> Option<KeyAction> {
    if characters.is_empty() {
        return None;
    }
    let shortcut = modifiers.control || modifiers.command;
    if !shortcut && let Some(character) = printable(characters) {
        return Some(KeyAction::Text(character.to_string()));
    }
    android_keycode(mac_key_code).map(|key_code| KeyAction::KeyCode {
        key_code,
        meta_state: modifiers.meta_state(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    const NONE: Modifiers = Modifiers {
        shift: false,
        control: false,
        option: false,
        command: false,
    };

    #[test]
    fn maps_letters_digits_and_navigation_keys() {
        assert_eq!(android_keycode(0x00), Some(29)); // A
        assert_eq!(android_keycode(0x06), Some(54)); // Z
        assert_eq!(android_keycode(0x1D), Some(7)); // 0
        assert_eq!(android_keycode(0x19), Some(16)); // 9
        assert_eq!(android_keycode(0x24), Some(66)); // Return
        assert_eq!(android_keycode(0x33), Some(67)); // Delete
        assert_eq!(android_keycode(0x30), Some(61)); // Tab
        assert_eq!(android_keycode(0x7E), Some(19)); // Up
        assert_eq!(android_keycode(0x7D), Some(20)); // Down
        assert_eq!(android_keycode(0x7B), Some(21)); // Left
        assert_eq!(android_keycode(0x7C), Some(22)); // Right
        assert_eq!(android_keycode(0x35), Some(akey::BACK)); // Escape
        assert_eq!(android_keycode(0x7A), None); // F1
    }

    #[test]
    fn every_letter_has_its_own_code() {
        let mut codes: Vec<u32> = (0..=0x7F).filter_map(android_keycode).collect();
        codes.retain(|code| (29..=54).contains(code));
        codes.sort_unstable();
        assert_eq!(codes, (29..=54).collect::<Vec<_>>());
    }

    #[test]
    fn meta_state_matches_the_renderer() {
        let all = Modifiers::from_flags(NS_SHIFT | NS_CONTROL | NS_OPTION | NS_COMMAND);
        assert_eq!(all.meta_state(), 0x41 | 0x12 | 0x3000 | 0x30000);
        assert_eq!(Modifiers::from_flags(NS_SHIFT).meta_state(), 0x41);
        assert_eq!(Modifiers::from_flags(0).meta_state(), 0);
    }

    #[test]
    fn printable_characters_are_text() {
        assert_eq!(
            resolve(0x00, "a", NONE),
            Some(KeyAction::Text("a".to_owned()))
        );
        let shift = Modifiers {
            shift: true,
            ..NONE
        };
        assert_eq!(
            resolve(0x00, "A", shift),
            Some(KeyAction::Text("A".to_owned()))
        );
        // A non-ASCII character AppKit already produced is sent as it is.
        assert_eq!(
            resolve(0x29, "ñ", NONE),
            Some(KeyAction::Text("ñ".to_owned()))
        );
    }

    #[test]
    fn shortcuts_and_special_keys_are_key_codes() {
        let command = Modifiers {
            command: true,
            ..NONE
        };
        assert_eq!(
            resolve(0x08, "c", command),
            Some(KeyAction::KeyCode {
                key_code: 31,
                meta_state: 0x30000
            })
        );
        // Return is "\r" and the arrows are in AppKit's function-key range: not text.
        assert_eq!(
            resolve(0x24, "\r", NONE),
            Some(KeyAction::KeyCode {
                key_code: 66,
                meta_state: 0
            })
        );
        assert_eq!(
            resolve(0x7E, "\u{F700}", NONE),
            Some(KeyAction::KeyCode {
                key_code: 19,
                meta_state: 0
            })
        );
        // Space is text, as in the renderer.
        assert_eq!(
            resolve(0x31, " ", NONE),
            Some(KeyAction::Text(" ".to_owned()))
        );
        assert_eq!(
            resolve(0x35, "\u{1b}", NONE),
            Some(KeyAction::KeyCode {
                key_code: akey::BACK,
                meta_state: 0
            })
        );
    }

    #[test]
    fn dead_keys_and_unmapped_keys_send_nothing() {
        // Option+E on a US layout is a dead key: no characters yet, so not the E key.
        let option = Modifiers {
            option: true,
            ..NONE
        };
        assert_eq!(resolve(0x0E, "", option), None);
        let command = Modifiers {
            command: true,
            ..NONE
        };
        assert_eq!(resolve(0x7A, "\u{F704}", command), None);
    }
}
