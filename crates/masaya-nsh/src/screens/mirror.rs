//! The mirror of one phone, the root of its own window ([`MirrorWindow`]): starts the scrcpy
//! session, shows the video in the `masaya.mirror` native view once it attaches, and closes
//! everything when the window goes.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;

use masaya_core::scrcpy::ScrcpySession;
use nsh_base::{button, theme};
use nsh_core::prelude::*;
use serde_json::json;
use tokio::task::AbortHandle;

use crate::copy;
use crate::i18n::{self, Key, t};
use crate::mirror::{control, pump, sink};
use crate::source::{AdbSource, DeviceSource};
use crate::state::{MirrorKind, MirrorView};
use crate::windows::OpenMirrors;
use crate::{bench, metrics};

/// The phone a mirror window shows.
#[derive(Clone, PartialEq, Props)]
pub struct MirrorWindowProps {
    pub serial: String,
    /// The phone's name, which titles the window.
    pub label: String,
    /// The window's generation ([`crate::windows::MirrorRequest`]), so closing it from the
    /// screen never closes a newer window of the same phone.
    pub generation: u64,
}

/// A mirror window's root: the phone of `serial`, through adb.
#[component]
pub fn MirrorWindow(props: MirrorWindowProps) -> impl IntoElement {
    let source: Arc<dyn DeviceSource> = Arc::new(AdbSource::new(i18n::locale()));
    let MirrorWindowProps {
        serial,
        label,
        generation,
    } = props;
    let on_close = {
        let serial = serial.clone();
        move || OpenMirrors::global().close_window(&serial, generation)
    };
    mirror_screen(source, serial, label, on_close)
}

/// The native view that shows the video (registered by `main.rs` on macOS).
pub const MIRROR_COMPONENT: &str = "masaya.mirror";

/// How long the native view may take to attach before the screen gives up on it.
const ATTACH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// What [`Running`] closes: the scrcpy session, or a fake in tests.
trait Session {
    /// Closes the sockets, which stops the server on the phone.
    fn close(self);
}

impl Session for ScrcpySession {
    fn close(self) {
        ScrcpySession::close(self);
    }
}

/// What the screen owns while it shows: closed and aborted when it goes or starts again.
struct Running<S: Session = ScrcpySession> {
    /// The start in progress: starting again or closing the window cancels it.
    starting: Option<AbortHandle>,
    session: Option<S>,
    pump: Option<AbortHandle>,
    /// The task that sends the view's input to the phone, in order.
    input: Option<AbortHandle>,
    key: Option<String>,
    /// The view attached and the video flows.
    attached: bool,
    /// Bumped by every stop: a task started for an earlier attempt sees it and does nothing.
    generation: u64,
    /// Where the video and the input of the session meet the view.
    registry: &'static sink::Registry,
    /// This screen's token for the dropped-moves counter of the metrics.
    metrics_owner: u64,
}

impl<S: Session> Running<S> {
    fn new(registry: &'static sink::Registry) -> Self {
        Self {
            starting: None,
            session: None,
            pump: None,
            input: None,
            key: None,
            attached: false,
            generation: 0,
            registry,
            metrics_owner: metrics::new_owner(),
        }
    }

    fn stop(&mut self) {
        self.generation = self.generation.wrapping_add(1);
        self.attached = false;
        for task in [self.starting.take(), self.pump.take(), self.input.take()]
            .into_iter()
            .flatten()
        {
            task.abort();
        }
        if let Some(session) = self.session.take() {
            session.close();
        }
        if let Some(key) = self.key.take() {
            self.registry.close(&key);
            metrics::clear_dropped_moves(self.metrics_owner);
        }
    }
}

impl Running<ScrcpySession> {
    /// Keeps a started session: its input channel and task, and its key in the registry.
    fn begin(&mut self, key: &str, session: ScrcpySession) {
        // One channel and one task for the input: the phone gets every message in the order
        // the view sent it.
        let (sender, messages) = tokio::sync::mpsc::unbounded_channel();
        self.registry.open(key);
        self.registry.set_input(key, sender);
        let control_handle = session.control();
        let counted = control_handle.clone();
        metrics::set_dropped_moves(
            self.metrics_owner,
            Box::new(move || counted.dropped_moves()),
        );
        let input = background(control::forward_in_order(messages, move |message| {
            let control_handle = control_handle.clone();
            async move {
                match control_handle.send(&message).await {
                    Ok(_) => true,
                    Err(error) => {
                        log::warn!("mirror: input stopped: {error}");
                        false
                    }
                }
            }
        }));
        self.starting = None;
        self.input = Some(input.abort_handle());
        self.session = Some(session);
        self.key = Some(key.to_owned());
    }
}

impl<S: Session> Drop for Running<S> {
    /// A window's engine tears down without running cleanups: the last owner of the state
    /// (the screen, or a task the teardown cancels) closes the session as it goes.
    fn drop(&mut self) {
        self.stop();
    }
}

/// The mirror of `serial` (`label` names it to the screen reader). While the video shows, Escape
/// goes to the phone as Back; without video (connecting, failed, ended) Escape and the Close
/// button call `on_close`. The window's close button and `⌘W` close it too.
pub fn mirror_screen(
    source: Arc<dyn DeviceSource>,
    serial: String,
    label: String,
    on_close: impl Fn() + 'static,
) -> impl IntoElement {
    let state = signal(MirrorView::Starting);
    // Tasks are started from buttons and events whose branch goes when the state changes: they
    // run under the screen's owner, so they live as long as the screen.
    let owner = Owner::current();
    let running = Rc::new(RefCell::new(Running::new(sink::registry())));
    {
        let running = running.clone();
        cleanup(move || running.borrow_mut().stop());
    }

    let start = {
        let running = running.clone();
        let connecting = copy::mirror_connecting_announcement(&label);
        Rc::new(move || {
            running.borrow_mut().stop();
            let generation = running.borrow().generation;
            state.set(MirrorView::Starting);
            log::debug!("mirror: connecting to {serial}");
            announce_for_accessibility(connecting.clone());
            let (source, serial, running) = (source.clone(), serial.clone(), running.clone());
            owner.run(|| {
                spawn(async move {
                    // `background` needs the runtime a task runs in, not a listener's.
                    if running.borrow().generation != generation {
                        return;
                    }
                    let handle = background(source.start_mirror(serial.clone()));
                    running.borrow_mut().starting = Some(handle.abort_handle());
                    let next = match handle.await {
                        Ok(Ok(session)) => {
                            let key = sink::new_key(&serial);
                            let (width, height) = (session.video.width, session.video.height);
                            running.borrow_mut().begin(&key, session);
                            Some(MirrorView::Running { key, width, height })
                        }
                        Ok(Err(message)) => {
                            log::warn!("mirror start failed: {message}");
                            Some(MirrorView::Failed(message))
                        }
                        // Cancelled: the screen went or started again.
                        Err(error) if error.is_cancelled() => None,
                        Err(error) => {
                            log::error!("mirror start task failed: {error}");
                            Some(MirrorView::Failed(t(Key::MirrorFailed).to_owned()))
                        }
                    };
                    // The borrow above has ended: setting the state renders, which may stop.
                    let Some(next) = next else { return };
                    let key = next.key();
                    state.set(next);
                    // A view that never attaches (no native component) would leave the screen
                    // connecting forever.
                    let Some(key) = key else { return };
                    timer(ATTACH_TIMEOUT).await;
                    let attached = running.borrow().attached;
                    let current = state.with_untracked(MirrorView::key);
                    if !attached && current.as_deref() == Some(key.as_str()) {
                        log::warn!("mirror: the video view never attached");
                        running.borrow_mut().stop();
                        state.set(MirrorView::Failed(t(Key::MirrorNoVideo).to_owned()));
                    }
                })
            });
        })
    };
    start();

    // The view attached under `key`: only now does the video start flowing, so the codec
    // configuration (the stream's first packet) always finds it.
    let on_attached = {
        let running = running.clone();
        let live = copy::mirror_live_announcement(&label);
        move |key: String| {
            let (reader, generation) = {
                let mut running = running.borrow_mut();
                if running.key.as_deref() != Some(key.as_str()) || running.attached {
                    return;
                }
                let reader = running.session.as_mut().and_then(ScrcpySession::take_video);
                running.attached = reader.is_some();
                (reader, running.generation)
            };
            let Some(reader) = reader else { return };
            announce_for_accessibility(live.clone());
            if let MirrorView::Running { width, height, .. } = state.get_untracked() {
                bench::start_from_env(&key, width, height);
            }
            let running = running.clone();
            owner.run(|| {
                spawn(async move {
                    if running.borrow().generation != generation {
                        return;
                    }
                    let handle =
                        background(async move { pump::pump(reader, sink::registry(), &key).await });
                    running.borrow_mut().pump = Some(handle.abort_handle());
                    let ended = match handle.await {
                        Ok(reason) => reason,
                        // Aborted: the screen went or started again, nothing to show.
                        Err(error) if error.is_cancelled() => return,
                        Err(error) => Some(error.to_string()),
                    };
                    if let Some(reason) = &ended {
                        log::warn!("mirror stream broke: {reason}");
                    }
                    running.borrow_mut().stop();
                    state.set(MirrorView::Ended(ended));
                })
            });
        }
    };

    let kind = computed(move || state.with(MirrorView::kind));
    let on_attached = Rc::new(on_attached);
    let video_label = copy::mirror_label(&label);
    let on_close: Rc<dyn Fn()> = Rc::new(on_close);
    {
        // With the video showing, its view has the keyboard and Escape goes to the phone; the
        // check keeps Escape from closing the window if NSH's root has it then.
        let on_close = on_close.clone();
        on_key("escape", move |_| {
            if kind.get_untracked() != MirrorKind::Running {
                on_close();
            }
        });
    }

    view()
        .flex_1()
        .bg(move || theme().background)
        .child(dynamic(move || match kind.get() {
            MirrorKind::Starting => centered()
                .child(muted(t(Key::MirrorStarting)))
                .into_element(),
            MirrorKind::Failed => {
                let start = start.clone();
                problem(
                    state,
                    Problem {
                        title: t(Key::MirrorFailed),
                        hint: None,
                        action: t(Key::Retry),
                    },
                    move || start(),
                    on_close.clone(),
                )
                .into_element()
            }
            MirrorKind::Ended => {
                let start = start.clone();
                problem(
                    state,
                    Problem {
                        title: t(Key::MirrorEnded),
                        hint: Some(t(Key::MirrorEndedHint)),
                        action: t(Key::MirrorReconnect),
                    },
                    move || start(),
                    on_close.clone(),
                )
                .into_element()
            }
            MirrorKind::Running => {
                let on_attached = on_attached.clone();
                native(MIRROR_COMPONENT)
                    .prop("session", move || json!(state.with(MirrorView::key)))
                    .on_native_event(move |event: &NativeEvent| {
                        if &*event.name == "attached"
                            && let Some(key) = event.data["session"].as_str()
                        {
                            on_attached(key.to_owned());
                        }
                    })
                    .role(AccessibilityRole::Group)
                    .label(video_label.clone())
                    .hint(t(Key::MirrorVideoHint))
                    .flex_1()
                    .bg(black())
                    .into_element()
            }
        }))
}

fn centered() -> View {
    view()
        .flex_1()
        .items_center()
        .justify_center()
        .gap_3()
        .p_6()
}

fn muted(copy: &'static str) -> Text {
    text(copy)
        .text_center()
        .text_color(move || theme().muted_foreground)
}

/// The words of a failure or an end.
struct Problem {
    title: &'static str,
    /// What to do about it, under adb's or the stream's detail.
    hint: Option<&'static str>,
    /// The main action: try again.
    action: &'static str,
}

/// A failure or an end: what happened, adb's or the stream's detail, what to do, how to try
/// again, and a way to close the window.
fn problem(
    state: Signal<MirrorView>,
    words: Problem,
    on_press: impl Fn() + 'static,
    on_close: Rc<dyn Fn()>,
) -> impl IntoElement {
    let Problem {
        title,
        hint,
        action,
    } = words;
    centered()
        .role(AccessibilityRole::Alert)
        .child(
            text(title)
                .text_center()
                .text_color(move || theme().destructive),
        )
        .child(when(
            move || state.with(|view| !view.detail().is_empty()),
            move || {
                text(move || state.with(MirrorView::detail))
                    .text_center()
                    .text_size(px(12.0))
                    .text_color(move || theme().muted_foreground)
            },
        ))
        .child(when(
            move || hint.is_some(),
            move || muted(hint.unwrap_or_default()),
        ))
        .child(
            view()
                .flex_row()
                .gap_2()
                .child(
                    button()
                        .on_press(on_press)
                        .px_4()
                        .py_2()
                        .rounded(move || theme().radius)
                        .bg(move || theme().primary)
                        .active(|s| s.opacity(0.6))
                        .child(text(action).text_color(move || theme().primary_foreground)),
                )
                .child(
                    button()
                        .on_press(move || on_close())
                        .px_4()
                        .py_2()
                        .rounded(move || theme().radius)
                        .border_1()
                        .border_color(move || theme().border)
                        .active(|s| s.opacity(0.6))
                        .child(text(t(Key::Close)).text_color(move || theme().foreground)),
                ),
        )
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicUsize, Ordering};

    use super::*;

    /// Counts its closes.
    struct Fake(Arc<AtomicUsize>);

    impl Session for Fake {
        fn close(self) {
            self.0.fetch_add(1, Ordering::SeqCst);
        }
    }

    fn registry() -> &'static sink::Registry {
        Box::leak(Box::default())
    }

    fn running(closes: &Arc<AtomicUsize>, registry: &'static sink::Registry) -> Running<Fake> {
        let mut running = Running::new(registry);
        running.session = Some(Fake(closes.clone()));
        running.key = Some("A1#1".into());
        registry.open("A1#1");
        running
    }

    #[test]
    fn dropping_the_state_closes_the_session_and_its_key() {
        let closes = Arc::new(AtomicUsize::new(0));
        let registry = registry();
        let running = running(&closes, registry);

        // The engine's teardown drops it without running the screen's cleanup.
        drop(running);
        assert_eq!(closes.load(Ordering::SeqCst), 1);
        assert!(!registry.is_open("A1#1"));
    }

    #[test]
    fn a_stop_then_a_drop_closes_each_once() {
        let closes = Arc::new(AtomicUsize::new(0));
        let registry = registry();
        let mut running = running(&closes, registry);

        running.stop();
        assert_eq!(closes.load(Ordering::SeqCst), 1);
        assert!(!registry.is_open("A1#1"));
        // Something opens the key again: the drop that follows must not close it a second time.
        registry.open("A1#1");
        drop(running);
        assert_eq!(closes.load(Ordering::SeqCst), 1);
        assert!(registry.is_open("A1#1"));
    }
}
