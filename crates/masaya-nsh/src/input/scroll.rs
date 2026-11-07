//! Wheel and trackpad deltas into Android scroll notches, the unit scrcpy sends (1 = one notch
//! of a mouse wheel on the phone). Ports `wheelDeltaToNotches` from `useMirrorInput.ts`.
//!
//! The renderer read Chromium's DOM deltas. On macOS Chromium hands a trackpad's precise deltas
//! through as pixels (points) and turns each line of a classic wheel into 40 pixels; the renderer
//! then counted 100 pixels as a notch. Reading `NSEvent` directly, the same rules give the same
//! scroll as the Electron app. DOM deltas are the negation of `scrollingDeltaX/Y`, and the
//! renderer negated them again, so `NSEvent`'s deltas keep their sign.

/// The most a single message may scroll, as `masaya_core` validates it.
pub const MAX_SCROLL_NOTCHES: f32 = 10.0;

/// Chromium's pixels per notch (the renderer's `PIXELS_PER_NOTCH`).
const POINTS_PER_NOTCH: f64 = 100.0;

/// Chromium's pixels per line of a non-precise wheel on macOS (`kScrollbarPixelsPerCocoaTick`).
const POINTS_PER_LINE: f64 = 40.0;

/// One axis of `NSEvent::scrollingDeltaX/Y` in notches. `precise` is
/// `NSEvent::hasPreciseScrollingDeltas` (a trackpad or Magic Mouse: points; otherwise lines).
pub fn delta_to_notches(delta: f64, precise: bool) -> f32 {
    if !delta.is_finite() {
        return 0.0;
    }
    let points = if precise {
        delta
    } else {
        delta * POINTS_PER_LINE
    };
    let notches = (points / POINTS_PER_NOTCH) as f32;
    notches.clamp(-MAX_SCROLL_NOTCHES, MAX_SCROLL_NOTCHES)
}

/// Both axes: `(scroll_x, scroll_y)` for `ControlMessage::Scroll`.
pub fn wheel_to_notches(delta_x: f64, delta_y: f64, precise: bool) -> (f32, f32) {
    (
        delta_to_notches(delta_x, precise),
        delta_to_notches(delta_y, precise),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: f32, b: f32) -> bool {
        (a - b).abs() < 1e-6
    }

    #[test]
    fn a_hundred_trackpad_points_are_one_notch() {
        assert!(close(delta_to_notches(100.0, true), 1.0));
        assert!(close(delta_to_notches(-25.0, true), -0.25));
    }

    #[test]
    fn a_wheel_line_scrolls_as_far_as_in_the_electron_app() {
        assert!(close(delta_to_notches(1.0, false), 0.4));
        assert!(close(delta_to_notches(-5.0, false), -2.0));
    }

    #[test]
    fn keeps_the_sign_of_nsevent() {
        // Wheel away from the user: positive deltaY in AppKit, which Android reads as scrolling up.
        let (x, y) = wheel_to_notches(0.0, 3.0, false);
        assert!(close(x, 0.0));
        assert!(y > 0.0);
    }

    #[test]
    fn large_or_invalid_deltas_stay_within_the_limit() {
        assert!(close(delta_to_notches(1e6, true), MAX_SCROLL_NOTCHES));
        assert!(close(delta_to_notches(-1e6, false), -MAX_SCROLL_NOTCHES));
        assert!(close(delta_to_notches(f64::NAN, true), 0.0));
        assert!(close(delta_to_notches(f64::INFINITY, false), 0.0));
    }
}
