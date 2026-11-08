//! What the toolbar, the navigation bar and the menu do to the phone, as control messages. They go
//! through the session's one ordered input channel ([`crate::mirror::control`]), the same one the
//! video's touches and keys use, so a button press can never overtake a touch.

use masaya_core::scrcpy::ControlMessage;

use crate::mirror::sink::Registry;

/// Something done to the phone.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PhoneAction {
    /// Turns the phone's screen 90°, as the rotate button of its navigation does.
    Rotate,
}

impl PhoneAction {
    /// The messages that do it, in order.
    pub fn messages(self) -> Vec<ControlMessage> {
        match self {
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
