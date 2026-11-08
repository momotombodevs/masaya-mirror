//! The device list's states, headless, with a scripted device source in place of adb.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use masaya_core::ErrorCode;
use masaya_core::adb::{AndroidDevice, DeviceStatus};
use masaya_nsh::copy;
use masaya_nsh::source::{DeviceSource, DevicesFuture, DevicesResult, LoadError, MirrorFuture};
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

/// The test's source, handed to the root the engine builds on its own thread.
static NEXT: Mutex<Option<Arc<Script>>> = Mutex::new(None);

/// Tests run in parallel and share `NEXT`, so each one waits until its root took it.
static START: Mutex<()> = Mutex::new(());

#[component]
fn TestApp() -> impl IntoElement {
    let source = NEXT.lock().expect("next").take();
    masaya_nsh::shell(source.expect("the test sets a source"))
}

fn start(script: Script) -> (Headless, Arc<Script>) {
    let script = Arc::new(script);
    let _one_at_a_time = START
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    *NEXT.lock().expect("next") = Some(script.clone());
    let mut app =
        Headless::start(EngineConfig::new(Root::of::<TestApp>())).expect("the app starts");
    // Every app starts loading: once it shows, the root took the source.
    app.wait_for(copy::LOADING)
        .expect("the list starts loading");
    assert!(NEXT.lock().expect("next").is_none());
    (app, script)
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
    app.wait_for(copy::EMPTY_TITLE).unwrap();
    assert!(app.screen().shows(copy::EMPTY_HINT));
    app.press(copy::REFRESH).unwrap();
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
    app.wait_for(copy::ADB_NOT_FOUND).unwrap();
    app.press(copy::RETRY).unwrap();
    app.wait_for("Pixel 8").unwrap();
}

#[test]
fn other_errors_show_a_header_and_the_detail() {
    let (mut app, _) = start(Script::new(|_, _| Err(LoadError::other("adb no responde"))));
    app.wait_for(copy::LIST_FAILED).unwrap();
    assert!(app.screen().shows("adb no responde"));
    assert!(app.screen().shows(copy::RETRY));
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
    assert!(!app.screen().shows(copy::LOADING));
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
            !app.screen().shows(copy::LIST_FAILED),
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
fn an_unauthorized_phone_says_what_to_do_and_an_online_one_opens() {
    let (mut app, source) = start(Script::new(|_, _| {
        Ok(vec![
            phone("U1", DeviceStatus::Unauthorized, "Moto G"),
            pixel(),
        ])
    }));
    app.wait_for(copy::HINT_UNAUTHORIZED).unwrap();
    assert!(app.screen().shows(copy::STATUS_UNAUTHORIZED));
    assert!(app.screen().shows(copy::STATUS_DEVICE));
    // A phone that is not authorized does not open (pressing a disabled button may be refused).
    let _ = app.press("Moto G");
    assert!(!app.screen().shows(copy::BACK));

    app.press("Pixel 8").unwrap();
    app.wait_for(copy::BACK).unwrap();
    app.press(copy::BACK).unwrap();
    app.wait_for("Moto G").unwrap();
    // Back from the mirror the list is kept: no loading, and adb was started only once.
    assert!(!app.screen().shows(copy::LOADING));
    assert_eq!(source.calls().iter().filter(|start| **start).count(), 1);
}

#[test]
fn escape_leaves_the_mirror() {
    let (mut app, _) = start(Script::new(|_, _| Ok(vec![pixel()])));
    app.wait_for("Pixel 8").unwrap();
    app.press("Pixel 8").unwrap();
    app.wait_for(copy::MIRROR_FAILED).unwrap();
    app.press_key("escape").unwrap();
    app.wait_for_gone(copy::MIRROR_FAILED, Duration::from_secs(5))
        .unwrap();
    app.wait_for("Pixel 8").unwrap();
}

#[test]
fn a_mirror_that_cannot_start_says_why_and_retries() {
    let (mut app, source) = start(Script::new(|_, _| Ok(vec![pixel()])));
    app.wait_for("Pixel 8").unwrap();
    app.press("Pixel 8").unwrap();
    app.wait_for(copy::MIRROR_FAILED).unwrap();
    assert!(app.screen().shows("Sin teléfono de prueba"));
    app.press(copy::RETRY).unwrap();
    app.wait_for(copy::MIRROR_FAILED).unwrap();
    // The retry ran a second start for the same phone.
    for _ in 0..50 {
        if source.mirrors.lock().expect("mirrors").len() >= 2 {
            break;
        }
        app.idle(Duration::from_millis(50)).unwrap();
    }
    assert_eq!(*source.mirrors.lock().expect("mirrors"), ["A1", "A1"]);
}
