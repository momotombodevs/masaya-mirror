//! Which phones have a mirror window open, shared by every window of the process.
//!
//! Each window runs its own NSH engine on its own thread, so this state lives at process level
//! (`Arc<Mutex>` and a `watch` channel), as [`crate::mirror::sink::registry`] does. The list asks
//! [`OpenMirrors::open_or_focus`] when a phone is clicked; a [`WindowHost`] (the macOS one in
//! `macos/windows.rs`, a fake one in tests) makes or focuses the window, and tells
//! [`OpenMirrors::closed`] when it goes.

use std::collections::{BTreeMap, BTreeSet};
use std::sync::{Arc, Mutex, MutexGuard, OnceLock};

use tokio::sync::watch;

/// A mirror window to make.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MirrorRequest {
    pub serial: String,
    /// What the window is titled: the phone's name.
    pub label: String,
    /// Tells this window's close from the close of an earlier window of the same phone.
    pub generation: u64,
}

/// Makes and focuses mirror windows. Called on whatever thread clicked (the list's engine
/// thread): an implementation hops to the main thread itself.
pub trait WindowHost: Send + Sync {
    /// Makes the window of `request`. When it closes, or cannot be made, the host calls
    /// [`OpenMirrors::closed`] on `mirrors` with the request's serial and generation.
    fn open(&self, mirrors: OpenMirrors, request: MirrorRequest);
    /// Brings the window of `serial` to the front.
    fn focus(&self, serial: &str);
}

/// What [`OpenMirrors::open_or_focus`] did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Opened {
    /// A new window was asked for, under this generation.
    New { generation: u64 },
    /// The phone already had one: it was brought to the front.
    Focused,
}

#[derive(Default)]
struct State {
    /// The generation of each open phone's window.
    open: BTreeMap<String, u64>,
    next_generation: u64,
}

/// The phones with a mirror window open (see the module docs). Cheap to clone: clones share it.
#[derive(Clone)]
pub struct OpenMirrors {
    state: Arc<Mutex<State>>,
    serials: Arc<watch::Sender<BTreeSet<String>>>,
    host: Option<Arc<dyn WindowHost>>,
}

impl OpenMirrors {
    /// No window open. `host` makes the windows; without one, only the bookkeeping runs.
    pub fn new(host: Option<Arc<dyn WindowHost>>) -> Self {
        Self {
            state: Arc::default(),
            serials: Arc::new(watch::Sender::new(BTreeSet::new())),
            host,
        }
    }

    /// The process's windows: on macOS they are real `NSWindow`s.
    pub fn global() -> &'static OpenMirrors {
        static GLOBAL: OnceLock<OpenMirrors> = OnceLock::new();
        GLOBAL.get_or_init(|| {
            #[cfg(target_os = "macos")]
            let host: Option<Arc<dyn WindowHost>> =
                Some(Arc::new(crate::macos::windows::MacWindows));
            #[cfg(not(target_os = "macos"))]
            let host: Option<Arc<dyn WindowHost>> = None;
            OpenMirrors::new(host)
        })
    }

    /// Opens the mirror of `serial`, or brings its window to the front when it has one: a double
    /// click never opens two.
    pub fn open_or_focus(&self, serial: &str, label: &str) -> Opened {
        let opened = {
            let mut state = self.state();
            if state.open.contains_key(serial) {
                Opened::Focused
            } else {
                state.next_generation += 1;
                let generation = state.next_generation;
                state.open.insert(serial.to_owned(), generation);
                self.publish(&state);
                Opened::New { generation }
            }
        };
        // Outside the lock: a host may call back (a window that cannot be made closes at once).
        if let Some(host) = &self.host {
            match opened {
                Opened::New { generation } => host.open(
                    self.clone(),
                    MirrorRequest {
                        serial: serial.to_owned(),
                        label: label.to_owned(),
                        generation,
                    },
                ),
                Opened::Focused => host.focus(serial),
            }
        }
        opened
    }

    /// The window of `serial` made under `generation` closed. A close of an older window (one
    /// whose phone was opened again since) changes nothing. Whether it was the open one.
    pub fn closed(&self, serial: &str, generation: u64) -> bool {
        let mut state = self.state();
        if state.open.get(serial) != Some(&generation) {
            return false;
        }
        state.open.remove(serial);
        self.publish(&state);
        true
    }

    pub fn is_open(&self, serial: &str) -> bool {
        self.state().open.contains_key(serial)
    }

    /// The open phones now.
    pub fn serials(&self) -> BTreeSet<String> {
        self.serials.borrow().clone()
    }

    /// The open phones, each time they change.
    pub fn subscribe(&self) -> watch::Receiver<BTreeSet<String>> {
        self.serials.subscribe()
    }

    fn publish(&self, state: &State) {
        let serials: BTreeSet<String> = state.open.keys().cloned().collect();
        self.serials.send_if_modified(|current| {
            let changed = *current != serials;
            *current = serials;
            changed
        });
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Default)]
    struct Recorder {
        opened: Mutex<Vec<MirrorRequest>>,
        focused: Mutex<Vec<String>>,
    }

    impl WindowHost for Recorder {
        fn open(&self, _mirrors: OpenMirrors, request: MirrorRequest) {
            self.opened.lock().unwrap().push(request);
        }

        fn focus(&self, serial: &str) {
            self.focused.lock().unwrap().push(serial.to_owned());
        }
    }

    fn with_recorder() -> (OpenMirrors, Arc<Recorder>) {
        let recorder = Arc::new(Recorder::default());
        (OpenMirrors::new(Some(recorder.clone())), recorder)
    }

    #[test]
    fn a_second_open_of_the_same_phone_focuses_its_window() {
        let (mirrors, host) = with_recorder();
        assert_eq!(
            mirrors.open_or_focus("A1", "Pixel 8"),
            Opened::New { generation: 1 }
        );
        assert_eq!(mirrors.open_or_focus("A1", "Pixel 8"), Opened::Focused);
        assert_eq!(
            *host.opened.lock().unwrap(),
            [MirrorRequest {
                serial: "A1".into(),
                label: "Pixel 8".into(),
                generation: 1
            }]
        );
        assert_eq!(*host.focused.lock().unwrap(), ["A1"]);
    }

    #[test]
    fn several_phones_open_at_once() {
        let (mirrors, host) = with_recorder();
        mirrors.open_or_focus("A1", "Pixel 8");
        mirrors.open_or_focus("B2", "Galaxy S23");
        assert!(mirrors.is_open("A1") && mirrors.is_open("B2"));
        assert_eq!(host.opened.lock().unwrap().len(), 2);
        assert_eq!(
            mirrors.serials().into_iter().collect::<Vec<_>>(),
            ["A1", "B2"]
        );
    }

    #[test]
    fn a_closed_window_opens_again_under_a_new_generation() {
        let (mirrors, host) = with_recorder();
        mirrors.open_or_focus("A1", "Pixel 8");
        assert!(mirrors.closed("A1", 1));
        assert!(!mirrors.is_open("A1"));
        assert_eq!(
            mirrors.open_or_focus("A1", "Pixel 8"),
            Opened::New { generation: 2 }
        );
        assert_eq!(host.opened.lock().unwrap().len(), 2);
    }

    #[test]
    fn a_stale_close_leaves_the_newer_window_open() {
        let (mirrors, _) = with_recorder();
        mirrors.open_or_focus("A1", "Pixel 8");
        mirrors.closed("A1", 1);
        mirrors.open_or_focus("A1", "Pixel 8");
        // The first window's close arrives late, or twice.
        assert!(!mirrors.closed("A1", 1));
        assert!(mirrors.is_open("A1"));
        // A phone that was never opened.
        assert!(!mirrors.closed("Z9", 1));
    }

    #[test]
    fn subscribers_see_each_change_once() {
        let (mirrors, _) = with_recorder();
        let mut serials = mirrors.subscribe();
        assert!(!serials.has_changed().unwrap());

        mirrors.open_or_focus("A1", "Pixel 8");
        assert!(serials.has_changed().unwrap());
        assert!(serials.borrow_and_update().contains("A1"));

        // Focusing changes nothing; neither does a stale close.
        mirrors.open_or_focus("A1", "Pixel 8");
        mirrors.closed("A1", 7);
        assert!(!serials.has_changed().unwrap());

        mirrors.closed("A1", 1);
        assert!(serials.has_changed().unwrap());
        assert!(serials.borrow_and_update().is_empty());
    }

    #[test]
    fn without_a_host_only_the_bookkeeping_runs() {
        let mirrors = OpenMirrors::new(None);
        assert_eq!(
            mirrors.open_or_focus("A1", "Pixel 8"),
            Opened::New { generation: 1 }
        );
        assert!(mirrors.is_open("A1"));
    }
}
