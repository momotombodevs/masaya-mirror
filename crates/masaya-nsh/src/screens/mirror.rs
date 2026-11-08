//! The mirror of one phone, the root of its own window ([`MirrorWindow`]): starts the scrcpy
//! session, shows the video in the `masaya.mirror` native view once it attaches, and closes
//! everything when the window goes.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;
use std::time::Instant;

use masaya_core::scrcpy::ScrcpySession;
use nsh_base::{button, theme};
use nsh_core::desktop::WindowLevel;
use nsh_core::element::desktop::{set_level, toggle_full_screen};
use nsh_core::prelude::*;
use serde_json::json;
use tokio::sync::mpsc::UnboundedReceiver;
use tokio::task::AbortHandle;

use crate::copy;
use crate::i18n::{self, Key, t};
use crate::mirror::{actions, control, pump, sink};
use crate::reconnect::{Next, Reconnect};
use crate::screens::live_settings;
use crate::screens::toolbar::{ToolbarAction, mirror_toolbar, navigation_bar};
use crate::settings::SettingsHub;
use crate::source::{AdbSource, DeviceSource};
use crate::state::{MirrorKind, MirrorView};
use crate::status::{STATUS_TIMEOUT, StatusMessage};
use crate::windows::{OpenMirrors, WindowEvent};
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
    let mirrors = OpenMirrors::global();
    let events = mirrors.listen(&serial, generation);
    let on_close = {
        let serial = serial.clone();
        move || mirrors.close_window(&serial, generation)
    };
    mirror_screen(source, serial, label, Some(events), on_close)
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

/// What a mirror screen does over its life: start the session, feed the view once it attaches,
/// and bring the stream back when it drops without the user asking ([`Reconnect`]). Its tasks
/// run under the screen's owner, so closing the window cancels them; a drop is a stream that
/// ended while the screen still lives.
struct Mirror {
    source: Arc<dyn DeviceSource>,
    serial: String,
    state: Signal<MirrorView>,
    owner: Owner,
    running: RefCell<Running>,
    reconnect: RefCell<Reconnect>,
    /// Why the stream or the last attempt failed, for the screen after giving up.
    last_error: RefCell<Option<String>>,
    connecting: String,
    live: String,
}

impl Mirror {
    /// Starts from scratch: the first open, or Retry after a start that failed.
    fn start(self: &Rc<Self>) {
        self.reconnect.borrow_mut().cancel();
        self.state.set(MirrorView::Starting);
        log::debug!("mirror: connecting to {}", self.serial);
        announce_for_accessibility(self.connecting.clone());
        self.open(|this, result| {
            if let Err(message) = result {
                this.state.set(MirrorView::Failed(message));
            }
        });
    }

    /// Opens a session. Once it is open the screen shows the video (`Running`, which the view
    /// attaches to); `done` hears whether it opened.
    fn open(self: &Rc<Self>, done: impl FnOnce(&Rc<Self>, Result<(), String>) + 'static) {
        self.running.borrow_mut().stop();
        let generation = self.running.borrow().generation;
        let this = self.clone();
        self.owner.run(|| {
            spawn(async move {
                // `background` needs the runtime a task runs in, not a listener's.
                if this.running.borrow().generation != generation {
                    return;
                }
                let handle = background(this.source.clone().start_mirror(this.serial.clone()));
                this.running.borrow_mut().starting = Some(handle.abort_handle());
                let opened = match handle.await {
                    Ok(Ok(session)) => {
                        let key = sink::new_key(&this.serial);
                        let (width, height) = (session.video.width, session.video.height);
                        this.running.borrow_mut().begin(&key, session);
                        Ok(MirrorView::Running { key, width, height })
                    }
                    Ok(Err(message)) => {
                        log::warn!("mirror start failed: {message}");
                        Err(message)
                    }
                    // Cancelled: the screen went or started again.
                    Err(error) if error.is_cancelled() => return,
                    Err(error) => {
                        log::error!("mirror start task failed: {error}");
                        Err(t(Key::MirrorFailed).to_owned())
                    }
                };
                // The borrows above have ended: setting the state renders, which may stop.
                let next = match opened {
                    Ok(next) => next,
                    Err(message) => return done(&this, Err(message)),
                };
                let key = next.key();
                this.state.set(next);
                done(&this, Ok(()));
                // A view that never attaches (no native component) would leave the screen
                // connecting forever.
                let Some(key) = key else { return };
                timer(ATTACH_TIMEOUT).await;
                let attached = this.running.borrow().attached;
                let current = this.state.with_untracked(MirrorView::key);
                if !attached && current.as_deref() == Some(key.as_str()) {
                    log::warn!("mirror: the video view never attached");
                    this.running.borrow_mut().stop();
                    this.state
                        .set(MirrorView::Failed(t(Key::MirrorNoVideo).to_owned()));
                }
            })
        });
    }

    /// The view attached under `key`: only now does the video start flowing, so the codec
    /// configuration (the stream's first packet) always finds it.
    fn attached(self: &Rc<Self>, key: String) {
        let (reader, generation) = {
            let mut running = self.running.borrow_mut();
            if running.key.as_deref() != Some(key.as_str()) || running.attached {
                return;
            }
            let reader = running.session.as_mut().and_then(ScrcpySession::take_video);
            running.attached = reader.is_some();
            (reader, running.generation)
        };
        let Some(reader) = reader else { return };
        announce_for_accessibility(self.live.clone());
        if let MirrorView::Running { width, height, .. } = self.state.get_untracked() {
            bench::start_from_env(&key, width, height);
        }
        let this = self.clone();
        self.owner.run(|| {
            spawn(async move {
                if this.running.borrow().generation != generation {
                    return;
                }
                let handle =
                    background(async move { pump::pump(reader, sink::registry(), &key).await });
                this.running.borrow_mut().pump = Some(handle.abort_handle());
                let ended = match handle.await {
                    Ok(reason) => reason,
                    // Aborted: the window closed or the screen started again, not a drop.
                    Err(error) if error.is_cancelled() => return,
                    Err(error) => Some(error.to_string()),
                };
                this.running.borrow_mut().stop();
                this.dropped(ended);
            })
        });
    }

    /// The stream ended while the screen lives (cable pulled, server killed): reconnect.
    fn dropped(self: &Rc<Self>, reason: Option<String>) {
        match &reason {
            Some(reason) => log::warn!("mirror stream of {} broke: {reason}", self.serial),
            None => log::warn!("mirror stream of {} ended", self.serial),
        }
        *self.last_error.borrow_mut() = reason;
        let next = self.reconnect.borrow_mut().begin(Instant::now());
        self.follow(next);
    }

    /// Try again after the reconnect gave up.
    fn reconnect_again(self: &Rc<Self>) {
        let next = self.reconnect.borrow_mut().begin(Instant::now());
        self.follow(next);
    }

    fn follow(self: &Rc<Self>, next: Next) {
        let max = self.reconnect.borrow().max_attempts();
        match next {
            Next::AlreadyRunning => {}
            Next::GaveUp => {
                log::warn!(
                    "mirror: gave up reconnecting to {} after {max} attempts",
                    self.serial
                );
                announce_for_accessibility(t(Key::MirrorReconnectFailed).to_owned());
                let detail = self.last_error.borrow().clone();
                self.state.set(MirrorView::GaveUp(detail));
            }
            Next::Attempt {
                attempt,
                delay,
                run,
            } => {
                log::info!(
                    "mirror: reconnecting to {}, attempt {attempt}/{max} in {delay:?}",
                    self.serial
                );
                if attempt == 1 {
                    announce_for_accessibility(t(Key::MirrorReconnecting).to_owned());
                }
                self.state.set(MirrorView::Reconnecting { attempt, max });
                let this = self.clone();
                self.owner.run(|| {
                    spawn(async move {
                        timer(delay).await;
                        if !this.reconnect.borrow().is_current(run) {
                            return;
                        }
                        this.open(move |this, result| match result {
                            Ok(()) => {
                                log::info!(
                                    "mirror: reconnected to {} on attempt {attempt}",
                                    this.serial
                                );
                                this.reconnect.borrow_mut().succeeded(run, Instant::now());
                            }
                            Err(message) => {
                                log::warn!("mirror: reconnect attempt {attempt} failed: {message}");
                                *this.last_error.borrow_mut() = Some(message);
                                let next = this.reconnect.borrow_mut().failed(run);
                                if let Some(next) = next {
                                    this.follow(next);
                                }
                            }
                        });
                    })
                });
            }
        }
    }
}

/// The mirror of `serial` (`label` names it to the screen reader). While the video shows, Escape
/// goes to the phone as Back; without video (connecting, failed, gave up) Escape and the Close
/// button call `on_close`. The window's close button and `⌘W` close it too. `events` are what
/// the window's host tells the screen (full screen).
pub fn mirror_screen(
    source: Arc<dyn DeviceSource>,
    serial: String,
    label: String,
    events: Option<UnboundedReceiver<WindowEvent>>,
    on_close: impl Fn() + 'static,
) -> impl IntoElement {
    let state = signal(MirrorView::Starting);
    // Tasks are started from buttons and events whose branch goes when the state changes: they
    // run under the screen's owner, so they live as long as the screen.
    let owner = Owner::current();
    let mirror = Rc::new(Mirror {
        source,
        serial,
        state,
        owner,
        running: RefCell::new(Running::new(sink::registry())),
        reconnect: RefCell::new(Reconnect::default()),
        last_error: RefCell::new(None),
        connecting: copy::mirror_connecting_announcement(&label),
        live: copy::mirror_live_announcement(&label),
    });
    {
        let mirror = mirror.clone();
        cleanup(move || {
            mirror.reconnect.borrow_mut().cancel();
            mirror.running.borrow_mut().stop();
        });
    }
    mirror.start();

    let kind = computed(move || state.with(MirrorView::kind));
    // Running and reconnecting share one branch: the video's view stays, on its last frame.
    let branch = computed(move || {
        let kind = kind.get();
        if kind.shows_video() {
            MirrorKind::Running
        } else {
            kind
        }
    });
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

    let settings = live_settings(SettingsHub::global());
    // In full screen only the phone shows: no toolbar, no navigation bar (as Electron's).
    let full_screen = signal(false);
    // Always on top floats this window above the others; every window follows the setting.
    let always_on_top = computed(move || settings.with(|settings| settings.always_on_top));
    effect(move || {
        set_level(if always_on_top.get() {
            WindowLevel::Floating
        } else {
            WindowLevel::Normal
        });
    });
    let show_clicks = computed(move || settings.with(|settings| settings.show_clicks));
    let running_now = computed(move || kind.get() == MirrorKind::Running);
    let status = signal(StatusMessage::default());
    // A passing message in the toolbar, gone after a while unless another replaced it.
    let show_status = move |message: &str| {
        let mut token = 0;
        status.update(|status| token = status.show(message));
        owner.run(|| {
            spawn(async move {
                timer(STATUS_TIMEOUT).await;
                status.update(|status| {
                    status.expire(token);
                });
            })
        });
    };
    let on_action: Rc<dyn Fn(ToolbarAction)> = Rc::new(move |action| match action {
        ToolbarAction::Phone(action) => {
            // The same ordered channel as the video's input: a press never overtakes a touch.
            let sent = state
                .with_untracked(MirrorView::key)
                .ok_or(actions::NotSent)
                .and_then(|key| actions::send(sink::registry(), &key, action));
            if sent.is_err() {
                log::warn!("mirror: {action:?} not sent, no session");
                show_status(t(Key::MirrorNotSent));
            }
        }
        ToolbarAction::FullScreen => toggle_full_screen(),
    });
    if let Some(mut events) = events {
        // The menu's actions on this window's phone go where the toolbar's do.
        let on_action = on_action.clone();
        spawn(async move {
            while let Some(event) = events.recv().await {
                match event {
                    WindowEvent::FullScreen(on) => full_screen.set(on),
                    WindowEvent::Phone(action) => on_action(ToolbarAction::Phone(action)),
                }
            }
        });
    }

    view()
        .flex_1()
        .bg(move || theme().background)
        .child({
            let on_action = on_action.clone();
            let label = label.clone();
            when(
                move || !full_screen.get(),
                move || {
                    mirror_toolbar(
                        label.clone(),
                        move || status.with(StatusMessage::text),
                        running_now,
                        on_action.clone(),
                    )
                },
            )
        })
        .child(view().flex_1().child(dynamic(move || {
            match branch.get() {
                MirrorKind::Starting => centered()
                    .child(muted(t(Key::MirrorStarting)))
                    .into_element(),
                MirrorKind::Failed => {
                    let mirror = mirror.clone();
                    problem(
                        state,
                        Problem {
                            title: t(Key::MirrorFailed),
                            hint: None,
                            action: t(Key::Retry),
                        },
                        move || mirror.start(),
                        on_close.clone(),
                    )
                    .into_element()
                }
                MirrorKind::GaveUp => {
                    let mirror = mirror.clone();
                    problem(
                        state,
                        Problem {
                            title: t(Key::MirrorReconnectFailed),
                            hint: Some(t(Key::MirrorGaveUpHint)),
                            action: t(Key::Retry),
                        },
                        move || mirror.reconnect_again(),
                        on_close.clone(),
                    )
                    .into_element()
                }
                MirrorKind::Running | MirrorKind::Reconnecting => {
                    let mirror = mirror.clone();
                    view()
                        .flex_1()
                        .child(
                            native(MIRROR_COMPONENT)
                                .prop("session", move || json!(state.with(MirrorView::key)))
                                .prop("showClicks", move || json!(show_clicks.get()))
                                .prop("reduceMotion", move || json!(reduce_motion()))
                                .on_native_event(move |event: &NativeEvent| {
                                    if &*event.name == "attached"
                                        && let Some(key) = event.data["session"].as_str()
                                    {
                                        mirror.attached(key.to_owned());
                                    }
                                })
                                .role(AccessibilityRole::Group)
                                .label(video_label.clone())
                                .hint(t(Key::MirrorVideoHint))
                                .flex_1()
                                .bg(black()),
                        )
                        .child(when(
                            move || kind.get() == MirrorKind::Reconnecting,
                            move || reconnecting_overlay(state),
                        ))
                        .into_element()
                }
            }
        })))
        .child(when(
            move || !full_screen.get() && settings.with(|settings| settings.navigation_bar),
            move || navigation_bar(running_now, on_action.clone()),
        ))
}

/// Over the video's last frame while the stream comes back: what happened and which attempt
/// runs.
fn reconnecting_overlay(state: Signal<MirrorView>) -> impl IntoElement {
    view()
        .absolute()
        .inset_0()
        .items_center()
        .justify_center()
        .gap_3()
        .p_6()
        .bg(rgba(0x0000_0099))
        .child(
            text(t(Key::MirrorReconnecting))
                .text_center()
                .text_color(white()),
        )
        .child(
            text(move || {
                state.with(|view| match view {
                    MirrorView::Reconnecting { attempt, max } => {
                        copy::reconnect_attempt(*attempt, *max)
                    }
                    _ => String::new(),
                })
            })
            .text_center()
            .text_size(px(12.0))
            .text_color(white()),
        )
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
