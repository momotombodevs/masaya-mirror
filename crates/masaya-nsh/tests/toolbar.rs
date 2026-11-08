//! The mirror window's toolbar and navigation bar, headless: their buttons, what each asks for,
//! and that they stay disabled while there is no video.

mod common;

use std::rc::Rc;
use std::sync::Mutex;

use masaya_nsh::i18n::{Key, t};
use masaya_nsh::mirror::actions::{DeviceKey, PhoneAction};
use masaya_nsh::screens::toolbar::{ToolbarAction, mirror_toolbar, navigation_bar};
use nsh_base::button;
use nsh_core::prelude::*;
use nsh_engine::{EngineConfig, Root};
use nsh_testing::Headless;

/// What the bars asked for, in order. One test at a time touches it ([`START`]).
static PRESSED: Mutex<Vec<ToolbarAction>> = Mutex::new(Vec::new());
static START: Mutex<()> = Mutex::new(());

/// A button the test presses to give the bars a phone (the video shows), as the screen does.
const CONNECT: &str = "Conectar (prueba)";

#[component]
fn TestBars() -> impl IntoElement {
    let enabled = signal(false);
    let running = computed(move || enabled.get());
    let on_action: Rc<dyn Fn(ToolbarAction)> =
        Rc::new(|action| PRESSED.lock().unwrap().push(action));
    view()
        .flex_1()
        .child(mirror_toolbar(
            "Pixel 8".to_owned(),
            move || {
                if enabled.get() {
                    "Listo".to_owned()
                } else {
                    String::new()
                }
            },
            running,
            on_action.clone(),
        ))
        .child(
            button()
                .on_press(move || enabled.set(true))
                .child(text(CONNECT)),
        )
        .child(navigation_bar(running, on_action))
}

fn start() -> (Headless, std::sync::MutexGuard<'static, ()>) {
    common::isolate();
    let guard = START
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    PRESSED.lock().unwrap().clear();
    let mut app =
        Headless::start(EngineConfig::new(Root::of::<TestBars>())).expect("the app starts");
    app.wait_for("Pixel 8").expect("the toolbar shows");
    (app, guard)
}

fn label(key: Key) -> String {
    format!("label:{}", t(key))
}

const BUTTONS: [Key; 8] = [
    Key::ToolbarVolumeUp,
    Key::ToolbarVolumeDown,
    Key::ToolbarPower,
    Key::ToolbarRotate,
    Key::ToolbarFullScreen,
    Key::NavigationBack,
    Key::NavigationHome,
    Key::NavigationRecents,
];

#[test]
fn the_buttons_are_disabled_until_the_video_shows() {
    let (mut app, _guard) = start();
    for key in BUTTONS {
        assert!(!app.screen().enabled(&label(key)).unwrap(), "{key:?}");
    }
    // A press on a disabled button asks for nothing.
    let _ = app.press(&label(Key::ToolbarVolumeUp));
    assert!(PRESSED.lock().unwrap().is_empty());

    app.press(CONNECT).unwrap();
    app.wait_for("Listo").unwrap();
    for key in BUTTONS {
        assert!(app.screen().enabled(&label(key)).unwrap(), "{key:?}");
    }
}

#[test]
fn each_button_asks_for_its_own_action() {
    let (mut app, _guard) = start();
    app.press(CONNECT).unwrap();
    app.wait_for("Listo").unwrap();
    for key in BUTTONS {
        app.press(&label(key)).unwrap();
    }
    let phone_key = |key| ToolbarAction::Phone(PhoneAction::Key(key));
    assert_eq!(
        *PRESSED.lock().unwrap(),
        [
            phone_key(DeviceKey::VolumeUp),
            phone_key(DeviceKey::VolumeDown),
            phone_key(DeviceKey::Power),
            ToolbarAction::Phone(PhoneAction::Rotate),
            ToolbarAction::FullScreen,
            phone_key(DeviceKey::Back),
            phone_key(DeviceKey::Home),
            phone_key(DeviceKey::Recents),
        ]
    );
}

#[test]
fn the_bars_have_names_for_screen_readers() {
    let (app, _guard) = start();
    assert!(
        app.screen()
            .matches(&format!("role:toolbar[{}]", t(Key::ToolbarLabel)))
            .unwrap()
    );
    assert!(
        app.screen()
            .matches(&format!("role:navigation[{}]", t(Key::NavigationLabel)))
            .unwrap()
    );
}
