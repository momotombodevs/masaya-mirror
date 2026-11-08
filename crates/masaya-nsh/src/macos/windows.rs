//! Mirror windows: one `NSWindow` per phone, each hosting its own NSH [`AppView`] (its own engine
//! and thread) whose root is [`MirrorWindow`]. NSH's `run_app` opens only the list's window; these
//! are made here, on the main thread, and kept in a thread-local map by serial.
//!
//! Closing a window (its close button or `⌘W`) stops its view: the engine's teardown drops the
//! screen's state, which closes the scrcpy session. Quitting closes them all ([`close_all`]).
//!
//! The list's window is NSH's; [`remember_list`] remembers it, so the first mirror window goes
//! beside it and Window > Dispositivos (`⌘0`, [`show_devices`]) brings it back once it was closed.

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

use crate::layout::{self, Orientation, WindowLayout, WindowNow};
use crate::screens::mirror::{MirrorWindow, MirrorWindowProps};
use crate::settings::SettingsHub;
use crate::windows::{MirrorRequest, OpenMirrors, WindowEvent, WindowHost};

/// The window's first content size, in points, until the first video sizes it to the phone
/// ([`fit_to_video`]).
const INITIAL_SIZE: (f64, f64) = (420.0, 860.0);
/// The gap between the list's window and the first mirror window beside it.
const GAP: f64 = 12.0;

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

    fn close(&self, serial: &str, generation: u64) {
        let serial = serial.to_owned();
        dispatch2::DispatchQueue::main().exec_async(move || {
            let window = WINDOWS.with(|windows| {
                windows
                    .borrow()
                    .get(&serial)
                    .filter(|open| open.generation == generation)
                    .map(|open| open.window.clone())
            });
            // Its delegate's `windowWillClose:` stops the view, as the close button does.
            if let Some(window) = window {
                window.close();
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
    /// Sized to the first video, then turned with the phone; kept across reconnects.
    layout: WindowLayout,
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
    /// `None` while no mirror window is open: the next one goes beside the list.
    static CASCADE: Cell<Option<NSPoint>> = const { Cell::new(None) };
    /// The list's window (NSH's), once [`remember_list`] found it.
    static LIST: RefCell<Option<Retained<NSWindow>>> = const { RefCell::new(None) };
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

        #[unsafe(method(windowDidEnterFullScreen:))]
        fn window_did_enter_full_screen(&self, _notification: &NSNotification) {
            self.tell(WindowEvent::FullScreen(true));
        }

        #[unsafe(method(windowDidExitFullScreen:))]
        fn window_did_exit_full_screen(&self, _notification: &NSNotification) {
            self.tell(WindowEvent::FullScreen(false));
        }
    }
);

impl WindowDelegate {
    fn new(mtm: MainThreadMarker, serial: String, generation: u64) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(DelegateIvars { serial, generation });
        // SAFETY: NSObject's designated initializer.
        unsafe { msg_send![super(this), init] }
    }

    /// Tells this window's screen about `event`.
    fn tell(&self, event: WindowEvent) {
        let DelegateIvars { serial, generation } = self.ivars();
        let mirrors = WINDOWS.with(|windows| {
            windows
                .borrow()
                .get(serial)
                .filter(|open| open.generation == *generation)
                .map(|open| open.mirrors.clone())
        });
        if let Some(mirrors) = mirrors {
            log::debug!("mirror window of {serial}: {event:?}");
            mirrors.send(serial, *generation, event);
        }
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
    let min = layout::min_content_size(Orientation::Portrait);
    window.setContentMinSize(NSSize::new(min.width, min.height));

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
            generation,
        })
        .app_id(crate::APP_ID)
    };
    view.load(App::Rust(root));

    place(&window);
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
                layout: WindowLayout::default(),
            },
        );
    });
}

/// The video of the mirror shown in `window` is now `width`×`height` (its first configuration, or
/// the phone turned): sizes the window to it, keeping its top left corner and keeping it on its
/// screen. A window the user made full screen or zoomed keeps its size. Main thread only.
pub fn fit_to_video(window: &NSWindow, width: u32, height: u32) {
    let content = window.contentRectForFrameRect(window.frame()).size;
    let Some(area) = window.screen().map(|screen| screen.visibleFrame()) else {
        return;
    };
    let now = WindowNow {
        content: layout::Size::new(content.width, content.height),
        work_area: layout::Size::new(area.size.width, area.size.height),
        navigation_bar: SettingsHub::global().with_settings(|settings| settings.navigation_bar),
        user_sized: window.styleMask().contains(NSWindowStyleMask::FullScreen) || window.isZoomed(),
    };
    let resize = WINDOWS.with(|windows| {
        let mut windows = windows.borrow_mut();
        let open = windows
            .values_mut()
            .find(|open| std::ptr::eq(&*open.window, window))?;
        open.layout.video_changed(width, height, now)
    });
    let Some(resize) = resize else {
        log::debug!("mirror window: video {width}×{height}, size kept");
        return;
    };
    window.setContentMinSize(NSSize::new(resize.min.width, resize.min.height));
    let frame = window.frame();
    let wanted = window.frameRectForContentRect(NSRect::new(
        NSPoint::new(0.0, 0.0),
        NSSize::new(resize.content.width, resize.content.height),
    ));
    // The top left corner stays where it was: AppKit's origin is the bottom left.
    let top = frame.origin.y + frame.size.height;
    let origin = clamp(
        NSPoint::new(frame.origin.x, top - wanted.size.height),
        wanted.size,
        area,
    );
    window.setFrame_display(NSRect::new(origin, wanted.size), true);
    log::info!(
        "mirror window: video {width}×{height}, content {:.0}×{:.0} → {:.0}×{:.0}",
        content.width,
        content.height,
        resize.content.width,
        resize.content.height
    );
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
    if WINDOWS.with(|windows| windows.borrow().is_empty()) {
        CASCADE.with(|cascade| cascade.set(None));
    }
}

/// Puts a new window beside the list's (the first one) or cascaded from the last one.
fn place(window: &NSWindow) {
    let next = match CASCADE.with(Cell::get) {
        Some(next) => next,
        None => {
            match beside_list(window.frame().size) {
                Some(origin) => window.setFrameOrigin(origin),
                None => window.center(),
            }
            // A zero point leaves the window where it is and gives where the next one goes.
            NSPoint::new(0.0, 0.0)
        }
    };
    CASCADE.with(|cascade| cascade.set(Some(window.cascadeTopLeftFromPoint(next))));
}

/// Where a window of `size` goes to the right of the visible list window, top edges aligned,
/// kept on the list's screen; `None` when the list is hidden.
fn beside_list(size: NSSize) -> Option<NSPoint> {
    let list = LIST.with(|list| list.borrow().clone())?;
    if !list.isVisible() {
        return None;
    }
    let frame = list.frame();
    let area = list.screen()?.visibleFrame();
    let origin = NSPoint::new(
        frame.origin.x + frame.size.width + GAP,
        frame.origin.y + frame.size.height - size.height,
    );
    Some(clamp(origin, size, area))
}

/// `origin` moved so a window of `size` stays inside `area` (its top left first when it is
/// bigger than the area).
fn clamp(origin: NSPoint, size: NSSize, area: NSRect) -> NSPoint {
    let max_x = area.origin.x + area.size.width - size.width;
    let max_y = area.origin.y + area.size.height - size.height;
    NSPoint::new(
        origin.x.min(max_x).max(area.origin.x),
        origin.y.max(area.origin.y).min(max_y),
    )
}

/// Remembers the list's window: the one window open now that is not a mirror's. Call it on the
/// main queue once NSH's app runs (`macos::menu::install` does).
pub fn remember_list(mtm: MainThreadMarker) {
    let mirrors: Vec<Retained<NSWindow>> = WINDOWS.with(|windows| {
        windows
            .borrow()
            .values()
            .map(|open| open.window.clone())
            .collect()
    });
    let list = NSApplication::sharedApplication(mtm)
        .windows()
        .iter()
        .find(|window| !mirrors.contains(window));
    LIST.with(|slot| *slot.borrow_mut() = list);
}

/// Window > Dispositivos: shows the list's window again, even after it was closed.
pub fn show_devices(mtm: MainThreadMarker) {
    let Some(list) = LIST.with(|list| list.borrow().clone()) else {
        return;
    };
    if list.isMiniaturized() {
        list.deminiaturize(None);
    }
    list.makeKeyAndOrderFront(None);
    NSApplication::sharedApplication(mtm).activate();
}

/// The mirror window that is key now: its phone, its generation and where to tell its screen.
/// `None` while the list (or no window of the app) is key.
pub fn key_mirror(mtm: MainThreadMarker) -> Option<(String, u64, OpenMirrors)> {
    let key = NSApplication::sharedApplication(mtm).keyWindow()?;
    WINDOWS.with(|windows| {
        windows
            .borrow()
            .iter()
            .find(|(_, open)| open.window == key)
            .map(|(serial, open)| (serial.clone(), open.generation, open.mirrors.clone()))
    })
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
    CASCADE.with(|cascade| cascade.set(None));
    count
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rect(x: f64, y: f64, w: f64, h: f64) -> NSRect {
        NSRect::new(NSPoint::new(x, y), NSSize::new(w, h))
    }

    #[test]
    fn a_window_beside_the_list_stays_on_its_screen() {
        let area = rect(0.0, 0.0, 1440.0, 875.0);
        let size = NSSize::new(420.0, 860.0);
        // Room to the right: it stays where it was asked.
        assert_eq!(
            clamp(NSPoint::new(500.0, 10.0), size, area),
            NSPoint::new(500.0, 10.0)
        );
        // Past the right edge or the bottom: pulled back in.
        assert_eq!(
            clamp(NSPoint::new(1300.0, -40.0), size, area),
            NSPoint::new(1020.0, 0.0)
        );
        // Taller than the area: its top (the title bar) stays inside.
        let tall = NSSize::new(420.0, 1000.0);
        assert_eq!(
            clamp(NSPoint::new(100.0, 0.0), tall, area),
            NSPoint::new(100.0, -125.0)
        );
    }
}
