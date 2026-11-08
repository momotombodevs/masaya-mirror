//! Mirror windows: one `NSWindow` per phone, each hosting its own NSH [`AppView`] (its own engine
//! and thread) whose root is [`MirrorWindow`]. NSH's `run_app` opens only the list's window; these
//! are made here, on the main thread, and kept in a thread-local map by serial.
//!
//! Closing a window (its close button or `⌘W`) stops its view: the engine's teardown drops the
//! screen's state, which closes the scrcpy session. Quitting closes them all ([`close_all`]).

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::Rc;

use nsh_platform_macos::{App, AppOptions, AppView, Components, Root};
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_app_kit::{
    NSApplication, NSBackingStoreType, NSWindow, NSWindowDelegate, NSWindowStyleMask,
};
use objc2_foundation::{
    NSNotification, NSObject, NSObjectProtocol, NSPoint, NSRect, NSSize, NSString,
};

use crate::screens::mirror::{MirrorWindow, MirrorWindowProps};
use crate::windows::{MirrorRequest, OpenMirrors, WindowHost};

/// The window's first content size, in points (slice 1.4 sizes it to the phone).
const INITIAL_SIZE: (f64, f64) = (420.0, 860.0);
/// The smallest content size the window can be resized to.
const MIN_SIZE: (f64, f64) = (280.0, 480.0);

/// The macOS [`WindowHost`]: hops to the main queue and makes or focuses the window there.
pub struct MacWindows;

impl WindowHost for MacWindows {
    fn open(&self, mirrors: OpenMirrors, request: MirrorRequest) {
        dispatch2::DispatchQueue::main().exec_async(move || match MainThreadMarker::new() {
            Some(mtm) => open(mtm, mirrors, request),
            None => {
                log::error!("mirror window: the main queue ran off the main thread");
                mirrors.closed(&request.serial, request.generation);
            }
        });
    }

    fn focus(&self, serial: &str) {
        let serial = serial.to_owned();
        dispatch2::DispatchQueue::main().exec_async(move || {
            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };
            let window = WINDOWS.with(|windows| {
                windows
                    .borrow()
                    .get(&serial)
                    .map(|open| open.window.clone())
            });
            // None: its window is still being made, and shows in front when it is.
            if let Some(window) = window {
                if window.isMiniaturized() {
                    window.deminiaturize(None);
                }
                window.makeKeyAndOrderFront(None);
                NSApplication::sharedApplication(mtm).activate();
            }
        });
    }
}

/// An open mirror window and what it owns.
struct Open {
    window: Retained<NSWindow>,
    view: Rc<AppView>,
    _delegate: Retained<WindowDelegate>,
    generation: u64,
    mirrors: OpenMirrors,
}

impl Open {
    /// Stops the engine (which closes the session) and tells the list.
    fn stop(self, serial: &str) {
        self.window.setDelegate(None);
        self.view.stop();
        self.mirrors.closed(serial, self.generation);
        // AppKit may still be inside this window's close: release it after the callback.
        GRAVEYARD.with(|graveyard| graveyard.borrow_mut().push(self));
        dispatch2::DispatchQueue::main().exec_async(|| {
            GRAVEYARD.with(|graveyard| graveyard.borrow_mut().clear());
        });
    }
}

thread_local! {
    static WINDOWS: RefCell<HashMap<String, Open>> = RefCell::new(HashMap::new());
    static GRAVEYARD: RefCell<Vec<Open>> = const { RefCell::new(Vec::new()) };
    /// Where the next window's top left goes, so new windows cascade instead of stacking.
    static CASCADE: Cell<Option<NSPoint>> = const { Cell::new(None) };
}

pub struct DelegateIvars {
    serial: String,
    generation: u64,
}

define_class!(
    /// Stops a mirror window's view when the window closes.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = DelegateIvars]
    #[name = "MasayaMirrorWindowDelegate"]
    struct WindowDelegate;

    unsafe impl NSObjectProtocol for WindowDelegate {}

    unsafe impl NSWindowDelegate for WindowDelegate {
        #[unsafe(method(windowWillClose:))]
        fn window_will_close(&self, _notification: &NSNotification) {
            let DelegateIvars { serial, generation } = self.ivars();
            close(serial, *generation);
        }
    }
);

impl WindowDelegate {
    fn new(mtm: MainThreadMarker, serial: String, generation: u64) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(DelegateIvars { serial, generation });
        // SAFETY: NSObject's designated initializer.
        unsafe { msg_send![super(this), init] }
    }
}

/// Makes the window of `request` and starts its view.
fn open(mtm: MainThreadMarker, mirrors: OpenMirrors, request: MirrorRequest) {
    let MirrorRequest {
        serial,
        label,
        generation,
    } = request;
    // A window of an older generation still open (it should not be): it goes first.
    let stale = WINDOWS.with(|windows| windows.borrow_mut().remove(&serial));
    if let Some(stale) = stale {
        log::warn!("mirror window: replacing a stale window of {serial}");
        stale.window.close();
        stale.stop(&serial);
    }

    let frame = NSRect::new(
        NSPoint::new(0.0, 0.0),
        NSSize::new(INITIAL_SIZE.0, INITIAL_SIZE.1),
    );
    let style = NSWindowStyleMask::Titled
        | NSWindowStyleMask::Closable
        | NSWindowStyleMask::Miniaturizable
        | NSWindowStyleMask::Resizable;
    // SAFETY: NSWindow's designated initializer.
    let window = unsafe {
        NSWindow::initWithContentRect_styleMask_backing_defer(
            NSWindow::alloc(mtm),
            frame,
            style,
            NSBackingStoreType::Buffered,
            false,
        )
    };
    // SAFETY: the window is kept in `WINDOWS` until it closes, then released after its close.
    unsafe { window.setReleasedWhenClosed(false) };
    window.setTitle(&NSString::from_str(&label));
    window.setContentMinSize(NSSize::new(MIN_SIZE.0, MIN_SIZE.1));

    // Each view has its own registry: the mirror's native view is registered on every one.
    let components = Components::default();
    super::register(&components);
    let view = AppView::new(
        mtm,
        AppOptions {
            app_id: crate::APP_ID.to_owned(),
            title: label.clone(),
            size: (INITIAL_SIZE.0 as i32, INITIAL_SIZE.1 as i32),
            components,
            ..Default::default()
        },
    );
    window.setContentView(Some(&view.view()));

    let delegate = WindowDelegate::new(mtm, serial.clone(), generation);
    window.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));

    let root = {
        let (serial, label) = (serial.clone(), label);
        Root::new::<MirrorWindow>(move || MirrorWindowProps {
            serial: serial.clone(),
            label: label.clone(),
        })
        .app_id(crate::APP_ID)
    };
    view.load(App::Rust(root));

    window.center();
    let next = CASCADE.with(Cell::get).unwrap_or(NSPoint::new(0.0, 0.0));
    CASCADE.with(|cascade| cascade.set(Some(window.cascadeTopLeftFromPoint(next))));
    window.makeKeyAndOrderFront(None);
    // NSH's root takes the keyboard until the video view does (it takes it when it shows).
    if let Some(root) = view.view().subviews().firstObject() {
        window.makeFirstResponder(Some(&root));
    }
    NSApplication::sharedApplication(mtm).activate();
    log::info!("mirror window opened for {serial}");

    WINDOWS.with(|windows| {
        windows.borrow_mut().insert(
            serial,
            Open {
                window,
                view,
                _delegate: delegate,
                generation,
                mirrors,
            },
        );
    });
}

/// The window of `serial` made under `generation` closed.
fn close(serial: &str, generation: u64) {
    let open = WINDOWS.with(|windows| {
        let mut windows = windows.borrow_mut();
        match windows.get(serial) {
            Some(open) if open.generation == generation => windows.remove(serial),
            _ => None,
        }
    });
    if let Some(open) = open {
        log::info!("mirror window closed for {serial}");
        open.stop(serial);
    }
}

/// Closes every mirror window and stops its view, which closes its session: the app quits.
/// Main thread only.
pub fn close_all() -> usize {
    let open: Vec<(String, Open)> = WINDOWS.with(|windows| windows.borrow_mut().drain().collect());
    let count = open.len();
    for (serial, open) in open {
        // Without its delegate the window's close does not come back here.
        open.window.setDelegate(None);
        open.window.close();
        open.stop(&serial);
    }
    GRAVEYARD.with(|graveyard| graveyard.borrow_mut().clear());
    count
}
