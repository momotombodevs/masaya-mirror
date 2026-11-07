//! Where a mirror's video goes: the view that shows it registers a [`FrameSink`] under the
//! session's key, and the pump hands each packet to it. Pump and view live on different threads
//! (a tokio worker and AppKit's main thread), so the registry is shared and locked briefly.
//!
//! A session's slot exists from [`Registry::open`] to [`Registry::close`]: a late packet or a
//! late view of a closed session finds nothing and recreates nothing. The last codec
//! configuration is kept per session: a view that attaches (or re-attaches) after it arrived can
//! still decode.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

use masaya_core::scrcpy::ControlMessage;
use tokio::sync::mpsc::UnboundedSender;

/// What shows a mirror's frames. Called from the pump's thread.
pub trait FrameSink: Send + Sync {
    /// A codec configuration (SPS/PPS, Annex-B). Comes first, and again when the stream changes
    /// (the phone rotated).
    fn configure(&self, config: &[u8]);
    /// One frame (Annex-B).
    fn frame(&self, data: &[u8], keyframe: bool);
}

#[derive(Default)]
struct Slot {
    sink: Option<Arc<dyn FrameSink>>,
    config: Option<Vec<u8>>,
    /// Where the view sends its input, in order ([`crate::mirror::control`]).
    input: Option<UnboundedSender<ControlMessage>>,
}

/// Mirrors by session key.
#[derive(Default)]
pub struct Registry {
    slots: Mutex<HashMap<String, Slot>>,
}

impl Registry {
    fn slots(&self) -> MutexGuard<'_, HashMap<String, Slot>> {
        // A panic while holding the lock leaves plain data behind: keep using it.
        self.slots
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    /// The session of `key` started: its view, packets and input can find each other.
    pub fn open(&self, key: &str) {
        self.slots().entry(key.to_owned()).or_default();
    }

    /// The view of `key` attached: frames go to `sink` from now on. Nothing for a session that
    /// is not open.
    pub fn attach(&self, key: &str, sink: Arc<dyn FrameSink>) {
        let config = {
            let mut slots = self.slots();
            let Some(slot) = slots.get_mut(key) else {
                return;
            };
            slot.sink = Some(sink.clone());
            slot.config.clone()
        };
        if let Some(config) = config {
            sink.configure(&config);
        }
    }

    /// The view went. Only `sink` is removed: a newer view of the same key stays.
    pub fn detach(&self, key: &str, sink: &Arc<dyn FrameSink>) {
        let mut slots = self.slots();
        if let Some(slot) = slots.get_mut(key)
            && slot
                .sink
                .as_ref()
                .is_some_and(|current| Arc::ptr_eq(current, sink))
        {
            slot.sink = None;
        }
    }

    /// The session of `key` takes input on `sender`.
    pub fn set_input(&self, key: &str, sender: UnboundedSender<ControlMessage>) {
        if let Some(slot) = self.slots().get_mut(key) {
            slot.input = Some(sender);
        }
    }

    /// Where the view of `key` sends its input, once the session takes it.
    pub fn input(&self, key: &str) -> Option<UnboundedSender<ControlMessage>> {
        self.slots().get(key).and_then(|slot| slot.input.clone())
    }

    /// The session ended: forget it.
    pub fn close(&self, key: &str) {
        self.slots().remove(key);
    }

    pub fn configure(&self, key: &str, config: &[u8]) {
        let sink = {
            let mut slots = self.slots();
            let Some(slot) = slots.get_mut(key) else {
                return;
            };
            slot.config = Some(config.to_vec());
            slot.sink.clone()
        };
        // Outside the lock: decoding must not hold up the view attaching.
        if let Some(sink) = sink {
            sink.configure(config);
        }
    }

    /// Hands a frame to the view, or drops it while none is attached.
    pub fn frame(&self, key: &str, data: &[u8], keyframe: bool) {
        let sink = self.slots().get(key).and_then(|slot| slot.sink.clone());
        if let Some(sink) = sink {
            sink.frame(data, keyframe);
        }
    }
}

/// The process's registry: the pump and the views find each other through it.
pub fn registry() -> &'static Registry {
    static REGISTRY: OnceLock<Registry> = OnceLock::new();
    REGISTRY.get_or_init(Registry::default)
}

/// A key no other session had, so a late frame of an old session never reaches a new view.
pub fn new_key(serial: &str) -> String {
    static NEXT: AtomicU64 = AtomicU64::new(1);
    format!("{serial}#{}", NEXT.fetch_add(1, Ordering::Relaxed))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct Recorder {
        seen: Mutex<Vec<String>>,
    }

    impl FrameSink for Recorder {
        fn configure(&self, config: &[u8]) {
            self.seen
                .lock()
                .unwrap()
                .push(format!("config {}", config.len()));
        }
        fn frame(&self, data: &[u8], keyframe: bool) {
            self.seen
                .lock()
                .unwrap()
                .push(format!("frame {} {keyframe}", data.len()));
        }
    }

    fn seen(recorder: &Recorder) -> Vec<String> {
        recorder.seen.lock().unwrap().clone()
    }

    #[test]
    fn frames_reach_the_attached_view() {
        let registry = Registry::default();
        registry.open("a");
        let recorder = Arc::new(Recorder::default());
        registry.attach("a", recorder.clone());
        registry.configure("a", &[1, 2]);
        registry.frame("a", &[1, 2, 3], true);
        registry.frame("b", &[9], false);
        assert_eq!(seen(&recorder), ["config 2", "frame 3 true"]);
    }

    #[test]
    fn a_late_view_still_gets_the_configuration() {
        let registry = Registry::default();
        registry.open("a");
        registry.configure("a", &[1, 2, 3]);
        registry.frame("a", &[1], true); // nobody to show it
        let recorder = Arc::new(Recorder::default());
        registry.attach("a", recorder.clone());
        assert_eq!(seen(&recorder), ["config 3"]);
    }

    #[test]
    fn detaching_an_old_view_keeps_the_new_one() {
        let registry = Registry::default();
        registry.open("a");
        let old: Arc<dyn FrameSink> = Arc::new(Recorder::default());
        let new = Arc::new(Recorder::default());
        registry.attach("a", old.clone());
        registry.attach("a", new.clone());
        registry.detach("a", &old);
        registry.frame("a", &[1], false);
        assert_eq!(seen(&new), ["frame 1 false"]);
    }

    #[test]
    fn a_closed_session_drops_its_frames() {
        let registry = Registry::default();
        registry.open("a");
        let recorder = Arc::new(Recorder::default());
        registry.attach("a", recorder.clone());
        registry.close("a");
        registry.frame("a", &[1], true);
        assert!(seen(&recorder).is_empty());
    }

    #[test]
    fn the_view_finds_the_sessions_input_until_it_closes() {
        let registry = Registry::default();
        registry.open("a");
        let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
        registry.set_input("a", tx);
        let input = registry.input("a").unwrap();
        input.send(ControlMessage::Rotate).unwrap();
        assert_eq!(rx.try_recv().unwrap(), ControlMessage::Rotate);
        registry.close("a");
        assert!(registry.input("a").is_none());
    }

    #[test]
    fn a_closed_session_is_not_recreated_by_late_packets_or_views() {
        let registry = Registry::default();
        registry.open("a");
        registry.close("a");
        registry.configure("a", &[1]);
        let recorder = Arc::new(Recorder::default());
        registry.attach("a", recorder.clone());
        registry.frame("a", &[1], true);
        assert!(seen(&recorder).is_empty());
        assert!(registry.slots().is_empty());
    }

    #[test]
    fn keys_are_unique() {
        assert_ne!(new_key("x"), new_key("x"));
    }
}
