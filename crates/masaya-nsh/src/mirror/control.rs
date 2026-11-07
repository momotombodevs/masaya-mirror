//! Input to the phone, in order. The view sends each message on one unbounded channel from the
//! main thread (sending never blocks it); a single task reads the channel and awaits
//! `ControlHandle::send` for each, so the phone gets them in the order they happened. A task per
//! event would let a later move overtake an earlier press.

use std::future::Future;

use masaya_core::scrcpy::ControlMessage;
use tokio::sync::mpsc::UnboundedReceiver;

/// Hands each message to `send`, one at a time, until the channel closes or `send` answers
/// `false` (the session is gone). A message the core would reject is skipped and logged.
pub async fn forward_in_order<F, Fut>(mut messages: UnboundedReceiver<ControlMessage>, mut send: F)
where
    F: FnMut(ControlMessage) -> Fut,
    Fut: Future<Output = bool>,
{
    while let Some(message) = messages.recv().await {
        if let Err(invalid) = message.validate() {
            log::warn!("mirror: input not sent ({invalid:?})");
            continue;
        }
        if !send(message).await {
            return;
        }
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    use tokio::sync::mpsc;

    use super::*;

    fn text(text: &str) -> ControlMessage {
        ControlMessage::Text {
            text: text.to_owned(),
        }
    }

    #[tokio::test]
    async fn messages_arrive_in_order_even_when_sending_is_slow() {
        let (tx, rx) = mpsc::unbounded_channel();
        for index in 0..20 {
            tx.send(text(&index.to_string())).unwrap();
        }
        drop(tx);
        let sent = Arc::new(Mutex::new(Vec::new()));
        let record = sent.clone();
        forward_in_order(rx, move |message| {
            let record = record.clone();
            async move {
                // The first ones take longest: a task per message would reorder them.
                if let ControlMessage::Text { text } = &message {
                    let index: u64 = text.parse().unwrap();
                    tokio::time::sleep(Duration::from_millis(20u64.saturating_sub(index))).await;
                }
                record.lock().unwrap().push(message);
                true
            }
        })
        .await;
        let expected: Vec<_> = (0..20).map(|index| text(&index.to_string())).collect();
        assert_eq!(*sent.lock().unwrap(), expected);
    }

    #[tokio::test]
    async fn stops_when_the_session_is_gone_and_skips_invalid_messages() {
        let (tx, rx) = mpsc::unbounded_channel();
        tx.send(ControlMessage::Scroll {
            pointer_x: 1,
            pointer_y: 1,
            video_width: 100,
            video_height: 100,
            scroll_x: 0.0,
            scroll_y: 99.0, // past the core's limit
            buttons: 0,
        })
        .unwrap();
        tx.send(text("a")).unwrap();
        tx.send(text("b")).unwrap();
        let sent = Arc::new(Mutex::new(Vec::new()));
        let record = sent.clone();
        forward_in_order(rx, move |message| {
            record.lock().unwrap().push(message);
            async { false }
        })
        .await;
        assert_eq!(*sent.lock().unwrap(), [text("a")]);
    }
}
