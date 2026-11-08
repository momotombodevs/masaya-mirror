//! The mirror of one phone, the root of its own window ([`MirrorWindow`]): the toolbar, the
//! video in the `masaya.mirror` native view, the navigation bar, and the screens of a failed
//! start or a reconnect. What it does over time (open, attach, reconnect) is the controller's
//! ([`super::controller`]).

use std::rc::Rc;
use std::sync::Arc;

use masaya_core::scrcpy::ScrcpySession;
use nsh_base::{button, theme};
use nsh_core::desktop::WindowLevel;
use nsh_core::element::desktop::{set_level, toggle_full_screen};
use nsh_core::prelude::*;
use serde_json::json;

use crate::copy;
use crate::i18n::{self, Key, t};
use crate::mirror::{actions, sink};
use crate::reconnect::Reconnect;
use crate::screens::controller::{Mirror, Opener};
use crate::screens::live_settings;
use crate::screens::toolbar::{ToolbarAction, mirror_toolbar, navigation_bar};
use crate::settings::SettingsHub;
use crate::source::{AdbSource, DeviceSource};
use crate::state::{MirrorKind, MirrorView};
use crate::status::{STATUS_TIMEOUT, StatusMessage};
use crate::windows::{OpenMirrors, WindowEvent};

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
    mirror_screen(
        source,
        serial,
        label,
        OpenMirrors::global().clone(),
        generation,
    )
}

/// The native view that shows the video (registered by `main.rs` on macOS).
pub const MIRROR_COMPONENT: &str = "masaya.mirror";

/// The mirror of `serial` (`label` names it to the screen reader), in the window `mirrors` made
/// under `generation`: the screen hears that window's events (full screen, the menu's actions),
/// tells it whether the video runs, and closes it with its Close buttons.
///
/// While the video shows, Escape goes to the phone as Back; without it (connecting, failed, gave
/// up) Escape closes the window. The window's close button and `⌘W` close it too.
pub fn mirror_screen(
    source: Arc<dyn DeviceSource>,
    serial: String,
    label: String,
    mirrors: OpenMirrors,
    generation: u64,
) -> impl IntoElement {
    let opener: Opener<ScrcpySession> = Rc::new(move |serial| source.clone().start_mirror(serial));
    let mirror = Mirror::new(opener, serial.clone(), &label, Reconnect::default());
    let state = mirror.state();
    mirror.start();

    let events = mirrors.listen(&serial, generation);
    let on_close: Rc<dyn Fn()> = {
        let (mirrors, serial) = (mirrors.clone(), serial.clone());
        Rc::new(move || mirrors.close_window(&serial, generation))
    };

    let kind = computed(move || state.with(MirrorView::kind));
    // The menu enables the phone's items only while the video runs, as the toolbar does.
    {
        let (mirrors, serial) = (mirrors.clone(), serial.clone());
        effect(move || mirrors.set_running(&serial, generation, kind.get() == MirrorKind::Running));
    }
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
    {
        // With the video showing (or frozen while reconnecting), its view has the keyboard and
        // Escape goes to the phone; the check keeps Escape from closing the window if NSH's
        // root has it then.
        let on_close = on_close.clone();
        on_key("escape", move |_| {
            if !kind.get_untracked().shows_video() {
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
    // Tasks are started from buttons and events whose branch goes when the state changes: they
    // run under the screen's owner, so they live as long as the screen.
    let owner = Owner::current();
    // A passing message in the toolbar (and for the screen reader), gone after a while unless
    // another replaced it.
    let show_status = move |message: &str| {
        announce_for_accessibility(message.to_owned());
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
    {
        // The menu's actions on this window's phone go where the toolbar's do.
        let on_action = on_action.clone();
        let mut events = events;
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
                            // Nothing else says it: the alert does.
                            alert: true,
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
                            // The controller announces it, with the phone's name.
                            alert: false,
                        },
                        move || mirror.reconnect_again(),
                        on_close.clone(),
                    )
                    .into_element()
                }
                MirrorKind::Running | MirrorKind::Reconnecting => {
                    let attach = mirror.clone();
                    let on_close = on_close.clone();
                    view()
                        .flex_1()
                        .child(
                            native(MIRROR_COMPONENT)
                                .prop("session", move || json!(state.with(MirrorView::key)))
                                .prop("showClicks", move || json!(show_clicks.get()))
                                // Reactive: NSH's environment updates it when the system's
                                // Reduce Motion changes.
                                .prop("reduceMotion", move || json!(reduce_motion()))
                                .on_native_event(move |event: &NativeEvent| {
                                    if &*event.name == "attached"
                                        && let Some(key) = event.data["session"].as_str()
                                    {
                                        attach.attached(key);
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
                            move || reconnecting_overlay(state, on_close.clone()),
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

/// Over the video's last frame while the stream comes back: what happened, which attempt runs,
/// and a way to close the window instead of waiting.
fn reconnecting_overlay(state: Signal<MirrorView>, on_close: Rc<dyn Fn()>) -> impl IntoElement {
    view()
        .absolute()
        .inset_0()
        .items_center()
        .justify_center()
        .gap_3()
        .p_6()
        .bg(rgba(0x0000_0099))
        .role(AccessibilityRole::Group)
        .label(t(Key::MirrorReconnecting))
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
        .child(
            button()
                .on_press(move || on_close())
                .px_4()
                .py_2()
                .rounded(move || theme().radius)
                .border_1()
                .border_color(white())
                .active(|s| s.opacity(0.6))
                .child(text(t(Key::Close)).text_color(white())),
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
    /// Screen readers hear it as an alert (when nothing announces it already).
    alert: bool,
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
        alert,
    } = words;
    let mut screen = centered();
    if alert {
        screen = screen.role(AccessibilityRole::Alert);
    }
    screen
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
