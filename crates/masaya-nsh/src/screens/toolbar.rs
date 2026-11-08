//! The mirror window's toolbar (the phone's name, a passing status message and the device
//! buttons) and the navigation bar under the screen (Back, Home, Recents). Ports
//! `MirrorToolbar.tsx` and `NavigationBar.tsx` without the buttons of features still to come:
//! there are no buttons that do nothing.
//!
//! The bars only say what was pressed ([`ToolbarAction`]); the screen sends it to the phone.

use std::rc::Rc;

use nsh_base::{button, theme};
use nsh_core::element::ImageSrc;
use nsh_core::prelude::*;

use crate::i18n::{Key, t};
use crate::layout::{NAVIGATION_BAR_HEIGHT, TOOLBAR_HEIGHT};
use crate::mirror::actions::{DeviceKey, PhoneAction};

/// What a button of the bars asks for.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolbarAction {
    Phone(PhoneAction),
    /// Enters or leaves full screen.
    FullScreen,
}

/// The icons, ported from the Electron app's `icons.tsx`: 24×24 strokes in the text's color.
mod icons {
    pub const VOLUME_UP: &str = r#"<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>"#;
    pub const VOLUME_DOWN: &str =
        r#"<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>"#;
    pub const POWER: &str = r#"<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/>"#;
    pub const ROTATE: &str =
        r#"<rect x="7" y="3" width="10" height="14" rx="2"/><path d="M5 21h8m0 0-2-2m2 2-2 2"/>"#;
    pub const FULL_SCREEN: &str = r#"<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>"#;
    pub const BACK: &str = r#"<path d="M15 5l-7 7 7 7"/>"#;
    pub const HOME: &str = r#"<circle cx="12" cy="12" r="7"/>"#;
    pub const RECENTS: &str = r#"<rect x="6" y="6" width="12" height="12" rx="2"/>"#;
}

/// The SVG document of an icon made of `shapes`.
fn icon_markup(shapes: &str) -> String {
    format!(
        r#"<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">{shapes}</svg>"#
    )
}

fn icon(shapes: &'static str) -> impl IntoElement {
    svg(ImageSrc::svg_markup(&icon_markup(shapes)))
        .w(px(18.0))
        .h(px(18.0))
        .text_color(move || theme().foreground)
}

/// An icon button: its label is what screen readers say and what its tooltip shows. Disabled
/// while `enabled` is false (no phone to send to).
fn icon_button(
    label: Key,
    shapes: &'static str,
    enabled: Memo<bool>,
    on_press: impl Fn() + 'static,
) -> impl IntoElement {
    let label = t(label);
    view()
        .tooltip(
            view()
                .px_2()
                .py_1()
                .rounded(px(6.0))
                .bg(move || theme().popover)
                .border_1()
                .border_color(move || theme().border)
                .child(
                    text(label)
                        .text_size(px(12.0))
                        .text_color(move || theme().popover_foreground),
                )
                .into_element(),
        )
        .child(
            button()
                .accessibility_label(label)
                .disabled(move || !enabled.get())
                .on_press(on_press)
                .w(px(32.0))
                .h(px(32.0))
                .items_center()
                .justify_center()
                .rounded(px(8.0))
                .hover(|s| s.bg(theme().accent))
                .active(|s| s.opacity(0.6))
                .disabled_style(|s| s.opacity(0.35))
                .child(icon(shapes)),
        )
}

fn divider() -> impl IntoElement {
    view()
        .mx_1()
        .w(px(1.0))
        .h(px(16.0))
        .bg(move || theme().border)
}

/// The bar at the top: the phone's name, `status` (a passing message, empty for none) beside it,
/// and the device buttons, enabled while `enabled` (the video shows).
pub fn mirror_toolbar(
    label: String,
    status: impl Fn() -> String + 'static,
    enabled: Memo<bool>,
    on_action: Rc<dyn Fn(ToolbarAction)>,
) -> impl IntoElement {
    let press = move |action: ToolbarAction| {
        let on_action = on_action.clone();
        move || on_action(action)
    };
    let key = |key: DeviceKey| ToolbarAction::Phone(PhoneAction::Key(key));
    view()
        .role(AccessibilityRole::Toolbar)
        .label(t(Key::ToolbarLabel))
        .h(px(TOOLBAR_HEIGHT as f32))
        .flex_row()
        .items_center()
        .justify_between()
        .gap_3()
        .px_3()
        .border_b_1()
        .border_b_color(move || theme().border)
        .bg(move || theme().card)
        .child(
            view()
                .flex_row()
                .flex_1()
                .items_center()
                .gap_2()
                .min_w(px(0.0))
                .child(
                    text(label)
                        .truncate()
                        .font_weight(FontWeight::MEDIUM)
                        .text_color(move || theme().foreground),
                )
                .child(
                    text(status)
                        .role(AccessibilityRole::Text)
                        .number_of_lines(1u32)
                        .text_size(px(12.0))
                        .text_color(move || theme().muted_foreground),
                ),
        )
        .child(
            view()
                .flex_row()
                .items_center()
                .gap_1()
                .child(icon_button(
                    Key::ToolbarVolumeUp,
                    icons::VOLUME_UP,
                    enabled,
                    press(key(DeviceKey::VolumeUp)),
                ))
                .child(icon_button(
                    Key::ToolbarVolumeDown,
                    icons::VOLUME_DOWN,
                    enabled,
                    press(key(DeviceKey::VolumeDown)),
                ))
                .child(icon_button(
                    Key::ToolbarPower,
                    icons::POWER,
                    enabled,
                    press(key(DeviceKey::Power)),
                ))
                .child(divider())
                .child(icon_button(
                    Key::ToolbarRotate,
                    icons::ROTATE,
                    enabled,
                    press(ToolbarAction::Phone(PhoneAction::Rotate)),
                ))
                .child(icon_button(
                    Key::ToolbarFullScreen,
                    icons::FULL_SCREEN,
                    enabled,
                    press(ToolbarAction::FullScreen),
                )),
        )
}

/// Back, Home and Recents under the screen, like the buttons of the phone itself.
pub fn navigation_bar(
    enabled: Memo<bool>,
    on_action: Rc<dyn Fn(ToolbarAction)>,
) -> impl IntoElement {
    let press = move |key: DeviceKey| {
        let on_action = on_action.clone();
        move || on_action(ToolbarAction::Phone(PhoneAction::Key(key)))
    };
    view()
        .role(AccessibilityRole::Navigation)
        .label(t(Key::NavigationLabel))
        .h(px(NAVIGATION_BAR_HEIGHT as f32))
        .flex_row()
        .items_center()
        .justify_center()
        .gap(px(40.0))
        .border_t_1()
        .border_t_color(move || theme().border)
        .bg(move || theme().card)
        .child(icon_button(
            Key::NavigationBack,
            icons::BACK,
            enabled,
            press(DeviceKey::Back),
        ))
        .child(icon_button(
            Key::NavigationHome,
            icons::HOME,
            enabled,
            press(DeviceKey::Home),
        ))
        .child(icon_button(
            Key::NavigationRecents,
            icons::RECENTS,
            enabled,
            press(DeviceKey::Recents),
        ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn icons_are_whole_svg_documents_drawn_in_the_text_color() {
        for shapes in [
            icons::VOLUME_UP,
            icons::VOLUME_DOWN,
            icons::POWER,
            icons::ROTATE,
            icons::FULL_SCREEN,
            icons::BACK,
            icons::HOME,
            icons::RECENTS,
        ] {
            let markup = icon_markup(shapes);
            assert!(markup.starts_with("<svg ") && markup.ends_with("</svg>"));
            assert!(markup.contains(r#"stroke="currentColor""#));
            assert!(markup.contains(r#"viewBox="0 0 24 24""#));
        }
    }
}
