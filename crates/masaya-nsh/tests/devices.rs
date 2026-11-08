//! The device list's states and the mirror screen, headless, with a scripted device source in
//! place of adb and a recorder in place of the mirror windows.

mod common;

use std::sync::{Arc, Mutex};
use std::time::Duration;

use masaya_core::ErrorCode;
use masaya_core::adb::{AndroidDevice, DeviceStatus};
use masaya_nsh::i18n::{Key, t};
use masaya_nsh::source::{DeviceSource, DevicesFuture, DevicesResult, LoadError, MirrorFuture};
use masaya_nsh::windows::{MirrorRequest, OpenMirrors, WindowHost};
use nsh_core::prelude::*;
use nsh_engine::{EngineConfig, Root};
use nsh_testing::Headless;
use tokio::sync::Notify;

type Respond = dyn Fn(usize, bool) -> DevicesResult + Send + Sync;

/// Answers each load from `respond(call index, start_server)`. The first load can be held until
/// the test releases it.
struct Script {
    respond: Box<Respond>,
    calls: Mutex<Vec<bool>>,
    /// The serials a mirror was started for. Every start fails: there is no phone in a test.
    mirrors: Mutex<Vec<String>>,
    hold_first: Option<Arc<Notify>>,
}

impl Script {
    fn new(respond: impl Fn(usize, bool) -> DevicesResult + Send + Sync + 'static) -> Self {
        Self {
            respond: Box::new(respond),
            calls: Mutex::new(Vec::new()),
            hold_first: None,
            mirrors: Mutex::new(Vec::new()),
        }
    }

    fn calls(&self) -> Vec<bool> {
        self.calls.lock().expect("calls").clone()
    }
}

impl DeviceSource for Script {
    fn start_mirror(self: Arc<Self>, serial: String) -> MirrorFuture {
        Box::pin(async move {
            self.mirrors.lock().expect("mirrors").push(serial);
            Err("Sin teléfono de prueba".to_owned())
        })
    }

    fn list(self: Arc<Self>, start_server: bool) -> DevicesFuture {
        Box::pin(async move {
            let index = {
                let mut calls = self.calls.lock().expect("calls");
                calls.push(start_server);
                calls.len() - 1
            };
            if index == 0
                && let Some(gate) = &self.hold_first
            {
                gate.notified().await;
            }
            (self.respond)(index, start_server)
        })
    }
}

/// Records the mirror windows the list asks for, in place of real windows.
#[derive(Default)]
struct Windows {
    opened: Mutex<Vec<MirrorRequest>>,
    focused: Mutex<Vec<String>>,
    closed: Mutex<Vec<(String, u64)>>,
}

impl Windows {
    /// Waits for the screen to ask for its window to close.
    fn wait_for_close(&self, app: &mut Headless) -> Vec<(String, u64)> {
        for _ in 0..100 {
            let closed = self.closed.lock().expect("closed").clone();
            if !closed.is_empty() {
                return closed;
            }
            app.idle(Duration::from_millis(20)).unwrap();
        }
        Vec::new()
    }
}

impl WindowHost for Windows {
    fn open(&self, _mirrors: OpenMirrors, request: MirrorRequest) {
        self.opened.lock().expect("opened").push(request);
    }

    fn focus(&self, serial: &str) {
        self.focused
            .lock()
            .expect("focused")
            .push(serial.to_owned());
    }

    fn close(&self, serial: &str, generation: u64) {
        self.closed
            .lock()
            .expect("closed")
            .push((serial.to_owned(), generation));
    }
}

/// What a test hands the root the engine builds on its own thread.
struct Next {
    script: Arc<Script>,
    mirrors: OpenMirrors,
}

/// The test's source and windows, handed to the root the engine builds on its own thread.
static NEXT: Mutex<Option<Next>> = Mutex::new(None);

/// Tests run in parallel and share `NEXT`, so each one waits until its root took it.
static START: Mutex<()> = Mutex::new(());

#[component]
fn TestApp() -> impl IntoElement {
    let next = NEXT.lock().expect("next").take();
    let next = next.expect("the test sets a source");
    masaya_nsh::shell(next.script, next.mirrors)
}

/// A mirror window's screen for phone `A1`, its window opened under generation 1.
#[component]
fn TestMirror() -> impl IntoElement {
    let next = NEXT.lock().expect("next").take();
    let next = next.expect("the test sets a source");
    let mirrors = next.mirrors;
    mirrors.open_or_focus("A1", "Pixel 8");
    masaya_nsh::screens::mirror::mirror_screen(
        next.script,
        "A1".to_owned(),
        "Pixel 8".to_owned(),
        move || mirrors.close_window("A1", 1),
    )
}

struct Started {
    app: Headless,
    script: Arc<Script>,
    mirrors: OpenMirrors,
    windows: Arc<Windows>,
}

/// `first` is a key, not its text: reading a text before `isolate` would read the user's settings.
fn start_root(script: Script, root: Root, first: Key) -> Started {
    common::isolate();
    let script = Arc::new(script);
    let windows = Arc::new(Windows::default());
    let mirrors = OpenMirrors::new(Some(windows.clone()));
    let _one_at_a_time = START
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *NEXT.lock().expect("next") = Some(Next {
        script: script.clone(),
        mirrors: mirrors.clone(),
    });
    let mut app = Headless::start(EngineConfig::new(root)).expect("the app starts");
    // Once the first state shows, the root took what the test handed it.
    app.wait_for(t(first))
        .expect("the root shows its first state");
    assert!(NEXT.lock().expect("next").is_none());
    Started {
        app,
        script,
        mirrors,
        windows,
    }
}

fn start(script: Script) -> (Headless, Arc<Script>) {
    let started = start_root(script, Root::of::<TestApp>(), Key::Loading);
    (started.app, started.script)
}

fn phone(id: &str, status: DeviceStatus, name: &str) -> AndroidDevice {
    AndroidDevice {
        id: id.to_owned(),
        status,
        model: None,
        product: None,
        display_name: Some(name.to_owned()),
    }
}

fn pixel() -> AndroidDevice {
    phone("A1", DeviceStatus::Device, "Pixel 8")
}

#[test]
fn shows_loading_then_the_empty_state_and_refreshes_on_demand() {
    let gate = Arc::new(Notify::new());
    // Only a load that starts adb after the first one finds the phone, so a 2 s refresh landing
    // before the press cannot make the test pass (or the button vanish).
    let mut held = Script::new(|index, start_server| {
        if index > 0 && start_server {
            Ok(vec![pixel()])
        } else {
            Ok(Vec::new())
        }
    });
    held.hold_first = Some(gate.clone());
    let (mut app, source) = start(held);

    gate.notify_one();
    app.wait_for(t(Key::EmptyTitle)).unwrap();
    assert!(app.screen().shows(t(Key::EmptyHint)));
    app.press(t(Key::Refresh)).unwrap();
    app.wait_for("Pixel 8").unwrap();
    let calls = source.calls();
    assert!(calls[0], "the first load starts adb");
    assert!(calls[1..].contains(&true), "the refresh starts adb");
}

#[test]
fn a_missing_adb_says_how_to_install_it_and_retry_recovers() {
    let (mut app, _) = start(Script::new(|index, _| {
        if index == 0 {
            Err(LoadError {
                code: Some(ErrorCode::AdbNotFound),
                detail: "ADB no encontrado.".to_owned(),
            })
        } else {
            Ok(vec![pixel()])
        }
    }));
    app.wait_for(t(Key::AdbNotFound)).unwrap();
    app.press(t(Key::Retry)).unwrap();
    app.wait_for("Pixel 8").unwrap();
}

#[test]
fn other_errors_show_a_header_and_the_detail() {
    let (mut app, _) = start(Script::new(|_, _| Err(LoadError::other("adb no responde"))));
    app.wait_for(t(Key::ListFailed)).unwrap();
    assert!(app.screen().shows("adb no responde"));
    assert!(app.screen().shows(t(Key::Retry)));
}

#[test]
fn the_list_refreshes_every_two_seconds_without_going_back_to_loading() {
    let (mut app, source) = start(Script::new(|index, _| {
        let mut devices = vec![pixel()];
        if index > 0 {
            devices.push(phone("B2", DeviceStatus::Device, "Galaxy S23"));
        }
        Ok(devices)
    }));
    app.wait_for("Pixel 8").unwrap();
    // The real clock runs: the next refresh lands within `wait_for`'s 5 s.
    app.wait_for("Galaxy S23").unwrap();
    assert!(app.screen().shows("Pixel 8"));
    assert!(!app.screen().shows(t(Key::Loading)));
    let calls = source.calls();
    assert!(
        calls[1..].iter().all(|start_server| !start_server),
        "refreshes skip start-server"
    );
}

#[test]
fn a_failed_refresh_keeps_the_list() {
    // Ok, then a failure, then Ok with a second phone.
    let (mut app, source) = start(Script::new(|index, _| match index {
        0 => Ok(vec![pixel()]),
        1 => Err(LoadError::other("adb no responde")),
        _ => Ok(vec![
            pixel(),
            phone("B2", DeviceStatus::Device, "Galaxy S23"),
        ]),
    }));
    app.wait_for("Pixel 8").unwrap();
    // Watch every batch until the third load lands: the row never goes, the error never shows.
    for _ in 0..100 {
        assert!(app.screen().shows("Pixel 8"), "the row stayed");
        assert!(
            !app.screen().shows(t(Key::ListFailed)),
            "no error over a list"
        );
        if app.screen().shows("Galaxy S23") {
            assert!(source.calls().len() >= 3);
            return;
        }
        app.idle(Duration::from_millis(100)).unwrap();
    }
    panic!("the third load never showed");
}

#[test]
fn an_unauthorized_phone_says_what_to_do_and_an_online_one_opens_its_window() {
    let mut started = start_root(
        Script::new(|_, _| {
            Ok(vec![
                phone("U1", DeviceStatus::Unauthorized, "Moto G"),
                pixel(),
            ])
        }),
        Root::of::<TestApp>(),
        Key::Loading,
    );
    let app = &mut started.app;
    app.wait_for(t(Key::HintUnauthorized)).unwrap();
    assert!(app.screen().shows(t(Key::StatusUnauthorized)));
    assert!(app.screen().shows(t(Key::StatusDevice)));
    // A phone that is not authorized does not open (pressing a disabled button may be refused).
    let _ = app.press("Moto G");
    assert!(started.windows.opened.lock().unwrap().is_empty());

    app.press("Pixel 8").unwrap();
    // The phone's row says its window is open, in place of its status; the list stays, it
    // never goes to loading.
    app.wait_for(t(Key::Mirroring)).unwrap();
    assert_eq!(
        app.screen()
            .texts()
            .iter()
            .filter(|text| text.trim() == t(Key::StatusDevice))
            .count(),
        0,
        "the open phone's status gave way to the badge (the other row is unauthorized)"
    );
    assert!(app.screen().shows("Moto G"));
    assert!(!app.screen().shows(t(Key::Loading)));
    assert_eq!(
        *started.windows.opened.lock().unwrap(),
        [MirrorRequest {
            serial: "A1".into(),
            label: "Pixel 8".into(),
            generation: 1,
        }]
    );
    assert_eq!(
        started
            .script
            .calls()
            .iter()
            .filter(|start| **start)
            .count(),
        1
    );
}

#[test]
fn opening_an_open_phone_again_focuses_its_window() {
    let mut started = start_root(
        Script::new(|_, _| Ok(vec![pixel()])),
        Root::of::<TestApp>(),
        Key::Loading,
    );
    let app = &mut started.app;
    app.wait_for("Pixel 8").unwrap();
    app.press("Pixel 8").unwrap();
    app.wait_for(t(Key::Mirroring)).unwrap();
    app.press("Pixel 8").unwrap();
    for _ in 0..50 {
        if !started.windows.focused.lock().unwrap().is_empty() {
            break;
        }
        app.idle(Duration::from_millis(20)).unwrap();
    }
    assert_eq!(started.windows.opened.lock().unwrap().len(), 1);
    assert_eq!(*started.windows.focused.lock().unwrap(), ["A1"]);
}

#[test]
fn the_badge_goes_when_the_window_closes() {
    let mut started = start_root(
        Script::new(|_, _| Ok(vec![pixel()])),
        Root::of::<TestApp>(),
        Key::Loading,
    );
    let app = &mut started.app;
    app.wait_for("Pixel 8").unwrap();
    app.press("Pixel 8").unwrap();
    app.wait_for(t(Key::Mirroring)).unwrap();
    // The window closes on another thread, as a real one closes on the main thread.
    let mirrors = started.mirrors.clone();
    std::thread::spawn(move || assert!(mirrors.closed("A1", 1)))
        .join()
        .unwrap();
    app.wait_for_gone(t(Key::Mirroring), Duration::from_secs(5))
        .unwrap();
    assert!(app.screen().shows("Pixel 8"));
}

#[test]
fn escape_without_video_closes_the_window() {
    let mut started = start_root(
        Script::new(|_, _| Ok(vec![pixel()])),
        Root::of::<TestMirror>(),
        Key::MirrorStarting,
    );
    let app = &mut started.app;
    app.wait_for(t(Key::MirrorFailed)).unwrap();
    // No video: Escape has nothing to send to the phone, so it closes the window.
    app.press_key("escape").unwrap();
    assert_eq!(started.windows.wait_for_close(app), [("A1".to_owned(), 1)]);
}

#[test]
fn a_failed_mirror_can_be_closed_from_the_screen() {
    let mut started = start_root(
        Script::new(|_, _| Ok(vec![pixel()])),
        Root::of::<TestMirror>(),
        Key::MirrorStarting,
    );
    let app = &mut started.app;
    app.wait_for(t(Key::MirrorFailed)).unwrap();
    assert!(app.screen().shows(t(Key::Retry)));
    app.press(t(Key::Close)).unwrap();
    assert_eq!(started.windows.wait_for_close(app), [("A1".to_owned(), 1)]);
}

#[test]
fn an_open_phone_that_went_offline_still_shows_its_window() {
    let mut started = start_root(
        Script::new(|index, _| {
            let status = if index == 0 {
                DeviceStatus::Device
            } else {
                DeviceStatus::Offline
            };
            Ok(vec![phone("A1", status, "Pixel 8")])
        }),
        Root::of::<TestApp>(),
        Key::Loading,
    );
    let app = &mut started.app;
    app.wait_for("Pixel 8").unwrap();
    app.press("Pixel 8").unwrap();
    app.wait_for(t(Key::Mirroring)).unwrap();
    // The 2 s refresh finds it offline: its row says what to do, and still opens its window.
    app.wait_for(t(Key::HintReconnect)).unwrap();
    app.press("Pixel 8").unwrap();
    for _ in 0..50 {
        if !started.windows.focused.lock().unwrap().is_empty() {
            break;
        }
        app.idle(Duration::from_millis(20)).unwrap();
    }
    assert_eq!(*started.windows.focused.lock().unwrap(), ["A1"]);
}

#[test]
fn a_mirror_that_cannot_start_says_why_and_retries() {
    let mut started = start_root(
        Script::new(|_, _| Ok(vec![pixel()])),
        Root::of::<TestMirror>(),
        Key::MirrorStarting,
    );
    let app = &mut started.app;
    app.wait_for(t(Key::MirrorFailed)).unwrap();
    assert!(app.screen().shows("Sin teléfono de prueba"));
    app.press(t(Key::Retry)).unwrap();
    app.wait_for(t(Key::MirrorFailed)).unwrap();
    // The retry ran a second start for the same phone.
    for _ in 0..50 {
        if started.script.mirrors.lock().expect("mirrors").len() >= 2 {
            break;
        }
        app.idle(Duration::from_millis(50)).unwrap();
    }
    assert_eq!(
        *started.script.mirrors.lock().expect("mirrors"),
        ["A1", "A1"]
    );
}
