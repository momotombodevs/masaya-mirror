//! The toolbar's passing status message: shown, then gone after [`STATUS_TIMEOUT`]. Ports
//! `useToolbarStatus.ts` as plain state; the screen runs the timer and hands back the token it
//! got, so a timer started for an older message never clears a newer one.

use std::time::Duration;

/// How long a message stays.
pub const STATUS_TIMEOUT: Duration = Duration::from_millis(2500);

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StatusMessage {
    message: Option<String>,
    /// Bumped by every show and clear.
    token: u64,
}

impl StatusMessage {
    /// Shows `message`, replacing the one shown. Clear it with [`Self::expire`] and the token
    /// returned once [`STATUS_TIMEOUT`] passed.
    pub fn show(&mut self, message: impl Into<String>) -> u64 {
        self.token = self.token.wrapping_add(1);
        self.message = Some(message.into());
        self.token
    }

    /// The time of the message shown under `token` is up: it goes, unless another message (or a
    /// clear) came since. Whether it went.
    pub fn expire(&mut self, token: u64) -> bool {
        if token != self.token || self.message.is_none() {
            return false;
        }
        self.message = None;
        true
    }

    /// Clears the message at once.
    pub fn clear(&mut self) {
        self.token = self.token.wrapping_add(1);
        self.message = None;
    }

    /// The message shown, empty for none.
    pub fn text(&self) -> String {
        self.message.clone().unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shows_a_message_and_clears_it_after_a_while() {
        let mut status = StatusMessage::default();
        let token = status.show("Grabando");
        assert_eq!(status.text(), "Grabando");
        assert!(status.expire(token));
        assert_eq!(status.text(), "");
    }

    #[test]
    fn clears_the_message_at_once_and_a_later_message_gets_its_full_time() {
        let mut status = StatusMessage::default();
        let first = status.show("Instalando…");
        status.clear();
        assert_eq!(status.text(), "");

        let second = status.show("Otro");
        // The first message's timer ends first: the new one stays for its own time.
        assert!(!status.expire(first));
        assert_eq!(status.text(), "Otro");
        assert!(status.expire(second));
        assert_eq!(status.text(), "");
    }

    #[test]
    fn a_new_message_restarts_the_time() {
        let mut status = StatusMessage::default();
        let first = status.show("Uno");
        let second = status.show("Dos");
        assert!(!status.expire(first));
        assert_eq!(status.text(), "Dos");
        assert!(status.expire(second));
        assert!(!status.expire(second));
    }
}
