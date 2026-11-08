//! The mirror's `NSView`: hosts the video layer and turns AppKit's mouse, wheel and keyboard
//! events into control messages ([`crate::input::events`]), sent in order on the session's
//! channel ([`crate::mirror::control`]).
//!
//! - Mouse: left button is the finger (pointer -1); right is Back and middle is Home, as scrcpy.
//! - Keyboard: the view takes the keyboard when it shows in its window and on every click
//!   (`makeFirstResponder:`), and hands it back to NSH's root when it leaves the window (the
//!   failed or ended screen's buttons and Escape need it). Key codes go straight to the phone;
//!   anything that types goes through the input system (`interpretKeyEvents:` →
//!   `NSTextInputClient`'s `insertText:`), so accents, dead keys and input methods arrive as the
//!   text they compose. Marked (in-progress) text is not shown: the phone gets the final text.
//! - Losing the keyboard (another view, or the window going to the back) lifts the finger and
//!   releases every key held on the phone.
//! - Modifier keys alone send nothing, as in the renderer: each key carries the meta state.

use std::cell::{Cell, RefCell};
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use masaya_core::scrcpy::ControlMessage;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObjectProtocol, Sel};
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, Message, define_class, msg_send, sel};
use objc2_app_kit::{
    NSEvent, NSResponder, NSTextInputClient, NSView, NSWindow, NSWindowDidResignKeyNotification,
};
use objc2_foundation::{
    NSArray, NSAttributedString, NSAttributedStringKey, NSNotFound, NSNotification,
    NSNotificationCenter, NSPoint, NSRange, NSRangePointer, NSRect, NSString, NSUInteger,
};
use tokio::sync::mpsc::UnboundedSender;

use dispatch2::{DispatchQueue, DispatchTime, MainThreadBound};
use objc2::rc::Weak;
use objc2_core_foundation::{CGPoint, CGRect, CGSize};
use objc2_core_graphics::CGColor;
use objc2_quartz_core::{CALayer, CATransaction, CATransform3D};

use super::mirror_view::unpack_size;
use crate::input::events::{Geometry, InputEvent, InputTranslator, KeyDown};
use crate::input::indicators::{Indicators, RELEASE};

/// The click circle's size, in points (the renderer's `h-10 w-10`).
const INDICATOR_DIAMETER: f64 = 40.0;
use crate::input::mapping::{VideoSize, ViewSize};

pub struct Ivars {
    translator: RefCell<InputTranslator>,
    input: RefCell<Option<UnboundedSender<ControlMessage>>>,
    video_size: Arc<AtomicU64>,
    marked: Cell<bool>,
    /// The window whose losing focus releases the keys.
    observed: RefCell<Option<Retained<NSWindow>>>,
    /// Show clicks: the circle under the pointer ([`crate::input::indicators`]).
    indicators: RefCell<Indicators>,
    show_clicks: Cell<bool>,
    /// Reduce Motion is on: the circle only fades, it does not grow.
    reduce_motion: Cell<bool>,
    /// The circle's layer, over the video, made on first use.
    indicator_layer: RefCell<Option<Retained<CALayer>>>,
}

define_class!(
    /// The mirror's view (see the module docs).
    #[unsafe(super(NSView, NSResponder, objc2_foundation::NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = Ivars]
    #[name = "MasayaMirrorView"]
    pub struct MirrorNSView;

    unsafe impl NSObjectProtocol for MirrorNSView {}

    impl MirrorNSView {
        #[unsafe(method(acceptsFirstResponder))]
        fn accepts_first_responder(&self) -> bool {
            true
        }

        #[unsafe(method(acceptsFirstMouse:))]
        fn accepts_first_mouse(&self, _event: Option<&NSEvent>) -> bool {
            true
        }

        #[unsafe(method(mouseDown:))]
        fn mouse_down(&self, event: &NSEvent) {
            // NSH's root holds the keyboard; the phone's view takes it on the first click.
            if let Some(window) = self.window() {
                window.makeFirstResponder(Some(self.as_responder()));
            }
            let (x, y) = self.point(event);
            self.handle(&InputEvent::MouseDown { x, y });
            if self.ivars().show_clicks.get() {
                self.ivars().indicators.borrow_mut().press(x, y);
                self.draw_indicator();
            }
        }

        #[unsafe(method(mouseDragged:))]
        fn mouse_dragged(&self, event: &NSEvent) {
            let (x, y) = self.point(event);
            self.handle(&InputEvent::MouseDragged { x, y });
            if self.ivars().show_clicks.get() {
                self.ivars().indicators.borrow_mut().drag(x, y);
                self.draw_indicator();
            }
        }

        #[unsafe(method(mouseUp:))]
        fn mouse_up(&self, event: &NSEvent) {
            let (x, y) = self.point(event);
            self.handle(&InputEvent::MouseUp { x, y });
            if self.ivars().show_clicks.get() {
                let token = self.ivars().indicators.borrow_mut().release(x, y);
                self.draw_indicator();
                self.expire_indicator_later(token);
            }
        }

        #[unsafe(method(rightMouseDown:))]
        fn right_mouse_down(&self, event: &NSEvent) {
            self.handle(&InputEvent::RightMouseDown);
            if self.ivars().show_clicks.get() {
                let (x, y) = self.point(event);
                let token = self.ivars().indicators.borrow_mut().tap(x, y);
                self.draw_indicator();
                self.expire_indicator_later(token);
            }
        }

        #[unsafe(method(otherMouseDown:))]
        fn other_mouse_down(&self, _event: &NSEvent) {
            self.handle(&InputEvent::OtherMouseDown);
        }

        #[unsafe(method(scrollWheel:))]
        fn scroll_wheel(&self, event: &NSEvent) {
            let (x, y) = self.point(event);
            self.handle(&InputEvent::Scroll {
                x,
                y,
                delta_x: event.scrollingDeltaX(),
                delta_y: event.scrollingDeltaY(),
                precise: event.hasPreciseScrollingDeltas(),
            });
        }

        #[unsafe(method(keyDown:))]
        fn key_down(&self, event: &NSEvent) {
            let characters = characters(event);
            let decision = self.ivars().translator.borrow_mut().key_down(
                event.keyCode(),
                &characters,
                event.modifierFlags().0 as u64,
                event.isARepeat(),
            );
            match decision {
                KeyDown::Send(messages) => self.send(messages),
                KeyDown::Compose => {
                    let events = NSArray::from_retained_slice(&[event.retain()]);
                    self.interpretKeyEvents(&events);
                }
            }
        }

        #[unsafe(method(keyUp:))]
        fn key_up(&self, event: &NSEvent) {
            let messages = self.ivars().translator.borrow_mut().key_up(
                event.keyCode(),
                &characters(event),
                event.modifierFlags().0 as u64,
            );
            self.send(messages);
        }

        #[unsafe(method(resignFirstResponder))]
        fn resign_first_responder(&self) -> bool {
            // SAFETY: NSView's standard responder transition.
            let accepted: bool = unsafe { msg_send![super(self), resignFirstResponder] };
            if accepted {
                self.release_all();
            }
            accepted
        }

        #[unsafe(method(viewWillMoveToWindow:))]
        fn view_will_move_to_window(&self, window: Option<&NSWindow>) {
            // Leaving the window (the video went: the stream failed or ended) while holding the
            // keyboard: NSH's root (the content view's first subview) takes it back, or no view
            // would get the keys of the screen that replaces the video.
            if window.is_none()
                && let Some(current) = self.window()
                && current
                    .firstResponder()
                    .is_some_and(|responder| std::ptr::eq(&*responder, self.as_responder()))
            {
                log::debug!("mirror view: handing the keyboard back to the root");
                let root = current
                    .contentView()
                    .and_then(|content| content.subviews().firstObject());
                match root {
                    Some(root) => current.makeFirstResponder(Some(&root)),
                    None => current.makeFirstResponder(None),
                };
            }
        }

        #[unsafe(method(viewDidMoveToWindow))]
        fn view_did_move_to_window(&self) {
            self.observe_window();
            // The window is this phone's alone: its keys (Escape is Back) go to the phone as soon
            // as the video shows.
            if let Some(window) = self.window() {
                window.makeFirstResponder(Some(self.as_responder()));
            }
        }

        #[unsafe(method(windowDidResignKey:))]
        fn window_did_resign_key(&self, _notification: &NSNotification) {
            self.release_all();
        }
    }

    // SAFETY: AppKit calls these on the main thread, with the documented argument types.
    unsafe impl NSTextInputClient for MirrorNSView {
        #[unsafe(method(insertText:replacementRange:))]
        unsafe fn insert_text(&self, string: &AnyObject, _replacement_range: NSRange) {
            self.ivars().marked.set(false);
            let text = text_of(string);
            if !text.is_empty() {
                self.handle(&InputEvent::Text(text));
            }
        }

        #[unsafe(method(doCommandBySelector:))]
        unsafe fn do_command_by_selector(&self, _selector: Sel) {
            // Commands (newline, delete, arrows) arrive as key codes in `keyDown:`; ignoring
            // them here keeps AppKit from beeping.
        }

        #[unsafe(method(setMarkedText:selectedRange:replacementRange:))]
        unsafe fn set_marked_text(
            &self,
            string: &AnyObject,
            _selected_range: NSRange,
            _replacement_range: NSRange,
        ) {
            self.ivars().marked.set(!text_of(string).is_empty());
        }

        #[unsafe(method(unmarkText))]
        fn unmark_text(&self) {
            self.ivars().marked.set(false);
        }

        #[unsafe(method(selectedRange))]
        fn selected_range(&self) -> NSRange {
            NSRange::new(NSNotFound as NSUInteger, 0)
        }

        #[unsafe(method(markedRange))]
        fn marked_range(&self) -> NSRange {
            if self.ivars().marked.get() {
                NSRange::new(0, 1)
            } else {
                NSRange::new(NSNotFound as NSUInteger, 0)
            }
        }

        #[unsafe(method(hasMarkedText))]
        fn has_marked_text(&self) -> bool {
            self.ivars().marked.get()
        }

        #[unsafe(method_id(attributedSubstringForProposedRange:actualRange:))]
        unsafe fn attributed_substring(
            &self,
            _range: NSRange,
            _actual_range: NSRangePointer,
        ) -> Option<Retained<NSAttributedString>> {
            None
        }

        #[unsafe(method_id(validAttributesForMarkedText))]
        fn valid_attributes_for_marked_text(&self) -> Retained<NSArray<NSAttributedStringKey>> {
            NSArray::new()
        }

        #[unsafe(method(firstRectForCharacterRange:actualRange:))]
        unsafe fn first_rect_for_character_range(
            &self,
            _range: NSRange,
            _actual_range: NSRangePointer,
        ) -> NSRect {
            // Input method windows open by the view's bottom left corner.
            let rect = self.convertRect_toView(NSRect::new(NSPoint::new(0.0, 0.0), self.bounds().size), None);
            self.window()
                .map_or(rect, |window| window.convertRectToScreen(rect))
        }

        #[unsafe(method(characterIndexForPoint:))]
        fn character_index_for_point(&self, _point: NSPoint) -> NSUInteger {
            NSNotFound as NSUInteger
        }
    }
);

/// `NSEvent::characters`, or empty (a dead key's first press has none).
fn characters(event: &NSEvent) -> String {
    event
        .characters()
        .map(|text| text.to_string())
        .unwrap_or_default()
}

/// The text of an `NSString` or `NSAttributedString`, as the input system hands either.
fn text_of(string: &AnyObject) -> String {
    if let Some(attributed) = string.downcast_ref::<NSAttributedString>() {
        return attributed.string().to_string();
    }
    string
        .downcast_ref::<NSString>()
        .map(NSString::to_string)
        .unwrap_or_default()
}

impl MirrorNSView {
    pub fn new(mtm: MainThreadMarker, video_size: Arc<AtomicU64>) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(Ivars {
            translator: RefCell::new(InputTranslator::default()),
            input: RefCell::new(None),
            video_size,
            marked: Cell::new(false),
            observed: RefCell::new(None),
            indicators: RefCell::new(Indicators::default()),
            show_clicks: Cell::new(false),
            reduce_motion: Cell::new(false),
            indicator_layer: RefCell::new(None),
        });
        // SAFETY: NSView's designated initializer.
        unsafe { msg_send![super(this), init] }
    }

    /// Where input goes: the session's channel, or nowhere while there is none.
    pub fn set_input(&self, input: Option<UnboundedSender<ControlMessage>>) {
        if input.is_none() {
            // The session went: whatever is held on the phone is moot, but the translator
            // must not think a finger or a key is still down.
            let _ = self.ivars().translator.borrow_mut().release_all();
        }
        *self.ivars().input.borrow_mut() = input;
    }

    /// Show clicks on or off (the `showClicks` setting).
    pub fn set_show_clicks(&self, on: bool) {
        self.ivars().show_clicks.set(on);
        if !on {
            self.ivars().indicators.borrow_mut().clear();
            self.draw_indicator();
        }
    }

    /// Reduce Motion on or off (the system's accessibility setting).
    pub fn set_reduce_motion(&self, on: bool) {
        self.ivars().reduce_motion.set(on);
    }

    /// Draws the circle as the indicators have it: solid where the finger touches; fading out
    /// (and growing, unless Reduce Motion is on) once it lifts; gone once its release is over.
    fn draw_indicator(&self) {
        let current = self.ivars().indicators.borrow().current();
        let Some(layer) = self.indicator_layer(current.is_some()) else {
            return;
        };
        CATransaction::begin();
        match current {
            None => {
                CATransaction::setDisableActions(true);
                layer.setHidden(true);
            }
            Some(indicator) => {
                // The circle jumps to the pointer; only the release animates.
                CATransaction::setDisableActions(indicator.down);
                CATransaction::setAnimationDuration(0.3);
                layer.setHidden(false);
                layer.setPosition(CGPoint::new(indicator.x, indicator.y));
                let grow = !indicator.down && !self.ivars().reduce_motion.get();
                let scale = if grow { 1.6 } else { 1.0 };
                layer.setTransform(CATransform3D::new_scale(scale, scale, 1.0));
                layer.setOpacity(if indicator.down { 1.0 } else { 0.0 });
            }
        }
        CATransaction::commit();
    }

    /// The circle's layer, made over the video when `make` and there is none yet.
    fn indicator_layer(&self, make: bool) -> Option<Retained<CALayer>> {
        if let Some(layer) = self.ivars().indicator_layer.borrow().as_ref() {
            return Some(layer.clone());
        }
        if !make {
            return None;
        }
        let host = self.layer()?;
        let layer = CALayer::new();
        let diameter = INDICATOR_DIAMETER;
        layer.setBounds(CGRect::new(
            CGPoint::new(0.0, 0.0),
            CGSize::new(diameter, diameter),
        ));
        layer.setCornerRadius(diameter / 2.0);
        layer.setBorderWidth(2.0);
        layer.setBorderColor(Some(&CGColor::new_srgb(1.0, 1.0, 1.0, 1.0)));
        // The accent at half strength, as the renderer's `bg-accent/50`.
        layer.setBackgroundColor(Some(&CGColor::new_srgb(0.04, 0.52, 1.0, 0.5)));
        layer.setShadowOpacity(0.35);
        layer.setShadowRadius(1.0);
        layer.setShadowOffset(CGSize::new(0.0, 0.0));
        layer.setHidden(true);
        host.addSublayer(&layer);
        *self.ivars().indicator_layer.borrow_mut() = Some(layer.clone());
        Some(layer)
    }

    /// Removes the released circle of `token` once its fade is over, if nothing touched since.
    fn expire_indicator_later(&self, token: u64) {
        let Ok(when) = DispatchTime::try_from(RELEASE) else {
            return;
        };
        let mtm = MainThreadMarker::from(self);
        let weak = MainThreadBound::new(Weak::from_retained(&self.retain()), mtm);
        let _ = DispatchQueue::main().after(when, move || {
            let Some(mtm) = MainThreadMarker::new() else {
                return;
            };
            if let Some(view) = weak.get(mtm).load()
                && view.ivars().indicators.borrow_mut().expire(token)
            {
                view.draw_indicator();
            }
        });
    }

    fn as_responder(&self) -> &NSResponder {
        self
    }

    fn geometry(&self) -> Option<Geometry> {
        let (width, height) = unpack_size(self.ivars().video_size.load(Ordering::Relaxed));
        if width == 0 || height == 0 {
            return None;
        }
        let size = self.bounds().size;
        Some(Geometry {
            view: ViewSize {
                width: size.width,
                height: size.height,
            },
            video: VideoSize { width, height },
            flipped: self.isFlipped(),
        })
    }

    fn point(&self, event: &NSEvent) -> (f64, f64) {
        let point = self.convertPoint_fromView(event.locationInWindow(), None);
        (point.x, point.y)
    }

    fn handle(&self, event: &InputEvent) {
        // Without a video there is nowhere to map a touch; keys and text need none.
        let geometry = self.geometry().unwrap_or(Geometry {
            view: ViewSize {
                width: 0.0,
                height: 0.0,
            },
            video: VideoSize {
                width: 0,
                height: 0,
            },
            flipped: false,
        });
        let messages = self
            .ivars()
            .translator
            .borrow_mut()
            .translate(event, geometry);
        self.send(messages);
    }

    fn release_all(&self) {
        let messages = self.ivars().translator.borrow_mut().release_all();
        self.send(messages);
    }

    /// Queues `messages` for the session, in order. Never blocks the main thread.
    fn send(&self, messages: Vec<ControlMessage>) {
        let input = self.ivars().input.borrow();
        let Some(input) = input.as_ref() else { return };
        for message in messages {
            if input.send(message).is_err() {
                // The session ended; the screen will say so.
                return;
            }
        }
    }

    /// Releases the keys when the window this view is in stops being the key window.
    fn observe_window(&self) {
        let center = NSNotificationCenter::defaultCenter();
        let name = unsafe { NSWindowDidResignKeyNotification };
        if let Some(old) = self.ivars().observed.borrow_mut().take() {
            // SAFETY: removes this view's registration for that window, made below.
            unsafe { center.removeObserver_name_object(self, Some(name), Some(&old)) };
        }
        if let Some(window) = self.window() {
            // SAFETY: `windowDidResignKey:` is a method of this class taking the notification;
            // the registration is removed above when the window changes, and AppKit drops it
            // when the view is deallocated (macOS 10.11+).
            unsafe {
                center.addObserver_selector_name_object(
                    self,
                    sel!(windowDidResignKey:),
                    Some(name),
                    Some(&window),
                );
            }
            *self.ivars().observed.borrow_mut() = Some(window);
        }
    }
}
