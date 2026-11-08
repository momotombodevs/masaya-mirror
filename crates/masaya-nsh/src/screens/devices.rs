//! The device list: loading, empty, error and the phones. The state and its 2 s refresh live in
//! [`DevicesStore`], which outlives this screen.

use std::collections::BTreeSet;
use std::rc::Rc;

use masaya_core::ErrorCode;
use nsh_base::{button, theme};
use nsh_core::prelude::*;

use crate::copy;
use crate::state::{DeviceRow, DevicesView, ViewKind};
use crate::store::DevicesStore;

/// Rows that cannot open are dimmed to this opacity.
const UNAVAILABLE_OPACITY: f32 = 0.6;

/// The list screen. `mirroring` holds the phones whose mirror window is open (their rows say
/// so); `on_open` gets a phone that can be mirrored (its id and label).
pub fn devices_screen(
    store: DevicesStore,
    mirroring: Signal<BTreeSet<String>>,
    on_open: impl Fn(String, String) + 'static,
) -> impl IntoElement {
    let state = store.view();
    let kind = computed(move || state.with(DevicesView::kind));
    let on_open = Rc::new(on_open);
    let on_retry = move || store.retry();

    // The screen reader hears each change of state (not each refresh).
    effect(move || {
        let message = match kind.get() {
            ViewKind::Loading => copy::LOADING.to_owned(),
            ViewKind::Empty => copy::EMPTY_TITLE.to_owned(),
            ViewKind::Error => copy::LIST_FAILED.to_owned(),
            ViewKind::Ready => {
                copy::devices_announcement(state.with_untracked(|view| view.rows().len()))
            }
        };
        announce_for_accessibility(message);
    });

    view()
        .flex_1()
        .bg(move || theme().background)
        .child(header())
        .child(dynamic(move || match kind.get() {
            ViewKind::Loading => centered().child(muted(copy::LOADING)).into_element(),
            ViewKind::Empty => centered()
                .child(title(copy::EMPTY_TITLE))
                .child(muted(copy::EMPTY_HINT))
                .child(action(copy::REFRESH, on_retry.clone()))
                .into_element(),
            ViewKind::Error => {
                error_message(state, action(copy::RETRY, on_retry.clone())).into_element()
            }
            ViewKind::Ready => {
                let on_open = on_open.clone();
                scroll()
                    .flex_1()
                    .child(view().p_3().gap_2().child(each(
                        move || state.with(DevicesView::rows),
                        |row: &DeviceRow| row.id.clone(),
                        move |row, _| device_row(row, mirroring, on_open.clone()),
                    )))
                    .into_element()
            }
        }))
}

fn header() -> impl IntoElement {
    view()
        .p_4()
        .border_b_1()
        .border_b_color(move || theme().border)
        .child(
            text(copy::DEVICES_TITLE)
                .role(AccessibilityRole::Header)
                .font_weight(FontWeight::SEMIBOLD)
                .text_size(px(18.0))
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

fn title(copy: &'static str) -> Text {
    text(copy)
        .role(AccessibilityRole::Header)
        .text_center()
        .font_weight(FontWeight::SEMIBOLD)
        .text_color(move || theme().foreground)
}

fn muted(copy: &'static str) -> Text {
    text(copy)
        .text_center()
        .text_color(move || theme().muted_foreground)
}

/// A missing adb says how to install it; any other failure shows a fixed header and adb's detail.
fn error_message(state: Signal<DevicesView>, action: AnyElement) -> impl IntoElement {
    let error = computed(move || state.with(DevicesView::error));
    let missing_adb = move || {
        error.with(|error| matches!(error, Some(e) if e.code == Some(ErrorCode::AdbNotFound)))
    };
    centered()
        .role(AccessibilityRole::Alert)
        .child(
            text(move || {
                if missing_adb() {
                    copy::ADB_NOT_FOUND
                } else {
                    copy::LIST_FAILED
                }
            })
            .text_center()
            .text_color(move || theme().destructive),
        )
        .child(when(
            move || !missing_adb(),
            move || {
                text(move || {
                    error.with(|error| error.as_ref().map(|e| e.detail.clone()).unwrap_or_default())
                })
                .text_center()
                .text_size(px(12.0))
                .text_color(move || theme().muted_foreground)
            },
        ))
        .child(action)
}

fn action(label: &'static str, on_press: impl Fn() + 'static) -> AnyElement {
    button()
        .on_press(on_press)
        .px_4()
        .py_2()
        .rounded(move || theme().radius)
        .bg(move || theme().primary)
        .active(|s| s.opacity(0.6))
        .child(text(label).text_color(move || theme().primary_foreground))
        .into_element()
}

/// A phone. Its bindings follow the row, so a phone that becomes authorized turns openable in
/// place, and one whose window opens or closes says so in place.
fn device_row(
    row: ReadSignal<DeviceRow>,
    mirroring: Signal<BTreeSet<String>>,
    on_open: Rc<dyn Fn(String, String)>,
) -> impl IntoElement {
    let openable = move || row.with(DeviceRow::openable);
    let open = move || row.with(|row| mirroring.with(|open| open.contains(&row.id)));
    button()
        .disabled(move || !openable())
        .accessibility_label(move || {
            let label = row.with(DeviceRow::accessibility_label);
            Some(SharedString::from(if open() {
                copy::mirroring_label(&label)
            } else {
                label
            }))
        })
        .on_press(move || {
            let row = row.get_untracked();
            if row.openable() {
                on_open(row.id, row.label);
            }
        })
        .p_3()
        .gap_1()
        .rounded(move || theme().radius)
        .border_1()
        .border_color(move || theme().border)
        .opacity(move || if openable() { 1.0 } else { UNAVAILABLE_OPACITY })
        .active(|s| s.bg(move || theme().muted))
        .child(
            view()
                .flex_row()
                .items_center()
                .justify_between()
                .gap_2()
                .child(
                    text(move || row.with(|row| row.label.clone()))
                        .number_of_lines(1)
                        .flex_1()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(move || {
                            if openable() {
                                theme().foreground
                            } else {
                                theme().muted_foreground
                            }
                        }),
                )
                .child(when(open, mirroring_badge))
                .child(
                    text(move || row.with(DeviceRow::status_text))
                        .text_size(px(12.0))
                        .text_color(move || theme().muted_foreground),
                ),
        )
        .child(when(
            move || row.with(|row| row.show_id),
            move || {
                text(move || row.with(|row| row.id.clone()))
                    .number_of_lines(1)
                    .text_size(px(11.0))
                    .text_color(move || theme().muted_foreground.opacity(0.7))
            },
        ))
        .child(when(
            move || row.with(|row| row.hint().is_some()),
            move || {
                text(move || row.with(|row| row.hint().unwrap_or_default()))
                    .text_size(px(12.0))
                    .text_color(move || theme().muted_foreground)
            },
        ))
}

/// Says a phone's mirror window is open.
fn mirroring_badge() -> impl IntoElement {
    view()
        .px_2()
        .py(px(2.0))
        .rounded(move || theme().radius)
        .bg(move || theme().primary)
        .child(
            text(copy::MIRRORING)
                .text_size(px(11.0))
                .font_weight(FontWeight::MEDIUM)
                .text_color(move || theme().primary_foreground),
        )
}
