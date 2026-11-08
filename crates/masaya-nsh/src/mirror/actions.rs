//! What the toolbar, the navigation bar and the menu do to the phone, as control messages. They go
//! through the session's one ordered input channel ([`crate::mirror::control`]), the same one the
//! video's touches and keys use, so a button press can never overtake a touch.

use masaya_core::scrcpy::ControlMessage;

use crate::input::events::key_press;
use crate::mirror::sink::Registry;

/// A button of the phone the bars press.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeviceKey {
    VolumeUp,
    VolumeDown,
    /// Turns the screen on or off.
    Power,
    Back,
    Home,
    /// The recent apps (Android's app switch).
    Recents,
}

impl DeviceKey {
    /// Its Android `KeyEvent` key code (`android-keycodes.ts`).
    pub fn key_code(self) -> u32 {
        match self {
            Self::Home => 3,
            Self::Back => 4,
            Self::VolumeUp => 24,
            Self::VolumeDown => 25,
            Self::Power => 26,
            Self::Recents => 187,
        }
    }
}

/// Something done to the phone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhoneAction {
    /// Presses and releases a key.
    Key(DeviceKey),
    /// Turns the phone's screen 90°, as the rotate button of its navigation does.
    Rotate,
}

impl PhoneAction {
    /// The messages that do it, in order: a key goes down and up back to back, so the phone sees
    /// a press with no gap (`key-press.ts`).
    pub fn messages(self) -> Vec<ControlMessage> {
        match self {
            Self::Key(key) => key_press(key.key_code()),
            Self::Rotate => vec![ControlMessage::Rotate],
        }
    }
}

/// The session of `key` is gone (or never took input): nothing was sent.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NotSent;

/// Queues `action` on the input channel of the session of `key`, behind whatever the video sent
/// before it. Never blocks.
pub fn send(registry: &Registry, key: &str, action: PhoneAction) -> Result<(), NotSent> {
    let input = registry.input(key).ok_or(NotSent)?;
    for message in action.messages() {
        input.send(message).map_err(|_| NotSent)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use tokio::sync::mpsc::{UnboundedReceiver, unbounded_channel};

    use super::*;

    fn registry_with_input() -> (Registry, UnboundedReceiver<ControlMessage>) {
        let registry = Registry::default();
        registry.open("k");
        let (tx, rx) = unbounded_channel();
        registry.set_input("k", tx);
        (registry, rx)
    }

    fn drain(rx: &mut UnboundedReceiver<ControlMessage>) -> Vec<ControlMessage> {
        std::iter::from_fn(|| rx.try_recv().ok()).collect()
    }

    fn key(action: u8, key_code: u32) -> ControlMessage {
        ControlMessage::Key {
            action,
            key_code,
            repeat: 0,
            meta_state: 0,
        }
    }

    /// `NavigationBar.test.tsx` and the toolbar's keys: each press is the key down, then up.
    #[test]
    fn each_key_is_pressed_and_released_on_the_phone() {
        for (device_key, code) in [
            (DeviceKey::Back, 4),
            (DeviceKey::Home, 3),
            (DeviceKey::Recents, 187),
            (DeviceKey::VolumeUp, 24),
            (DeviceKey::VolumeDown, 25),
            (DeviceKey::Power, 26),
        ] {
            let (registry, mut rx) = registry_with_input();
            send(&registry, "k", PhoneAction::Key(device_key)).unwrap();
            assert_eq!(
                drain(&mut rx),
                [key(0, code), key(1, code)],
                "{device_key:?}"
            );
        }
    }

    #[test]
    fn rotate_sends_scrcpys_rotate() {
        let (registry, mut rx) = registry_with_input();
        send(&registry, "k", PhoneAction::Rotate).unwrap();
        assert_eq!(drain(&mut rx), [ControlMessage::Rotate]);
    }

    #[test]
    fn actions_queue_behind_the_input_already_sent() {
        let (registry, mut rx) = registry_with_input();
        let text = ControlMessage::Text { text: "a".into() };
        registry.input("k").unwrap().send(text.clone()).unwrap();
        send(&registry, "k", PhoneAction::Rotate).unwrap();
        assert_eq!(drain(&mut rx), [text, ControlMessage::Rotate]);
    }

    #[test]
    fn nothing_is_sent_without_a_session() {
        let (registry, rx) = registry_with_input();
        assert_eq!(send(&registry, "other", PhoneAction::Rotate), Err(NotSent));
        drop(rx);
        // The session's task is gone: its channel is closed.
        assert_eq!(send(&registry, "k", PhoneAction::Rotate), Err(NotSent));
    }
}
