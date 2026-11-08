//! The mirror of one phone, in the same window as the list: starts the scrcpy session, shows the
//! video in the `masaya.mirror` native view once it attaches, and closes everything when the
//! screen goes.

use std::cell::RefCell;
use std::rc::Rc;
use std::sync::Arc;

use masaya_core::scrcpy::ScrcpySession;
use nsh_base::{button, theme};
use nsh_core::prelude::*;
use serde_json::json;
use tokio::task::AbortHandle;

use crate::copy;
use crate::mirror::{control, pump, sink};
use crate::source::DeviceSource;
use crate::state::{MirrorKind, MirrorView};
use crate::{bench, metrics};

/// The native view that shows the video (registered by `main.rs` on macOS).
pub const MIRROR_COMPONENT: &str = "masaya.mirror";

/// How long the native view may take to attach before the screen gives up on it.
const ATTACH_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(5);

/// What the screen owns while it shows: closed and aborted when it goes or starts again.
#[derive(Default)]
struct Running {
    /// The start in progress: Back or Escape while connecting cancels it.
    starting: Option<AbortHandle>,
    session: Option<ScrcpySession>,
    pump: Option<AbortHandle>,
    /// The task that sends the view's input to the phone, in order.
    input: Option<AbortHandle>,
    key: Option<String>,
    /// The view attached and the video flows.
    attached: bool,
    /// Bumped by every stop: a task started for an earlier attempt sees it and does nothing.
    generation: u64,
}

impl Running {
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
            // Closes the sockets, which stops the server on the phone.
            session.close();
        }
        if let Some(key) = self.key.take() {
            sink::registry().close(&key);
            metrics::set_dropped_moves(None);
        }
    }

    /// Keeps a started session: its input channel and task, and its key in the registry.
    fn begin(&mut self, key: &str, session: ScrcpySession) {
        // One channel and one task for the input: the phone gets every message in the order
        // the view sent it.
        let (sender, messages) = tokio::sync::mpsc::unbounded_channel();
        sink::registry().open(key);
        sink::registry().set_input(key, sender);
        let control_handle = session.control();
        let counted = control_handle.clone();
        metrics::set_dropped_moves(Some(Box::new(move || counted.dropped_moves())));
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

pub fn mirror_screen(
    source: Arc<dyn DeviceSource>,
    serial: String,
    label: String,
    on_back: impl Fn() + 'static,
) -> impl IntoElement {
    let state = signal(MirrorView::Starting);
    // Tasks are started from buttons and events whose branch goes when the state changes: they
    // run under the screen's owner, so they live as long as the screen.
    let owner = Owner::current();
    let running = Rc::new(RefCell::new(Running::default()));
    {
        let running = running.clone();
        cleanup(move || running.borrow_mut().stop());
    }

    let start = {
        let running = running.clone();
        Rc::new(move || {
            running.borrow_mut().stop();
            let generation = running.borrow().generation;
            state.set(MirrorView::Starting);
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
                            Some(MirrorView::Failed(copy::MIRROR_FAILED.to_owned()))
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
                        state.set(MirrorView::Failed(copy::MIRROR_NO_VIDEO.to_owned()));
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

    let on_back = Rc::new(on_back);
    {
        let on_back = on_back.clone();
        // Escape goes back, as long as this screen shows.
        on_key("escape", move |_| on_back());
    }
    let kind = computed(move || state.with(MirrorView::kind));
    let on_attached = Rc::new(on_attached);
    let video_label = copy::mirror_label(&label);

    view()
        .flex_1()
        .bg(move || theme().background)
        .child(header(label, on_back))
        .child(dynamic(move || match kind.get() {
            MirrorKind::Starting => centered()
                .child(muted(copy::MIRROR_STARTING))
                .into_element(),
            MirrorKind::Failed => {
                let start = start.clone();
                problem(state, copy::MIRROR_FAILED, copy::RETRY, move || start()).into_element()
            }
            MirrorKind::Ended => {
                let start = start.clone();
                problem(
                    state,
                    copy::MIRROR_ENDED,
                    copy::MIRROR_RECONNECT,
                    move || start(),
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
                    .role(AccessibilityRole::Image)
                    .label(video_label.clone())
                    .flex_1()
                    .bg(black())
                    .into_element()
            }
        }))
}

fn header(label: String, on_back: Rc<impl Fn() + 'static>) -> impl IntoElement {
    view()
        .flex_row()
        .items_center()
        .gap_3()
        .p_4()
        .border_b_1()
        .border_b_color(move || theme().border)
        .child(
            button()
                .on_press(move || on_back())
                .px_2()
                .py_1()
                .hit_slop(EdgeInsets::all(px(8.0)))
                .rounded(move || theme().radius)
                .active(|s| s.opacity(0.6))
                .child(text(copy::BACK).text_color(move || theme().primary)),
        )
        .child(
            text(label)
                .role(AccessibilityRole::Header)
                .number_of_lines(1)
                .flex_1()
                .font_weight(FontWeight::SEMIBOLD)
                .text_color(move || theme().foreground),
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

/// A failure or an end: what happened, adb's or the stream's detail, and how to try again.
fn problem(
    state: Signal<MirrorView>,
    title: &'static str,
    action: &'static str,
    on_press: impl Fn() + 'static,
) -> impl IntoElement {
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
}
