//! "Show clicks": a circle under the pointer while it touches the phone's screen, so whoever
//! watches the window sees where it is tapped. Ports `TouchIndicators.tsx` as plain state; the
//! view draws it (`macos/input_view.rs`) and runs the release timer, handing back the token it
//! got so a timer of an older release never removes a newer touch.
//!
//! The Mac has one pointer, the mouse: one indicator at most.

use std::time::Duration;

/// How long a released circle stays (fading out) before it goes.
pub const RELEASE: Duration = Duration::from_millis(350);

/// A circle to draw, in the view's coordinates.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Indicator {
    pub x: f64,
    pub y: f64,
    /// Touching: drawn solid. Released: fading out and growing.
    pub down: bool,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Indicators {
    current: Option<Indicator>,
    /// Bumped by every press and release.
    token: u64,
}

impl Indicators {
    /// The left button went down: the finger touches at (`x`, `y`).
    pub fn press(&mut self, x: f64, y: f64) {
        self.token = self.token.wrapping_add(1);
        self.current = Some(Indicator { x, y, down: true });
    }

    /// The right button (Back): shown as a tap, with no drag to follow. Remove it with
    /// [`Self::expire`] and the token returned once [`RELEASE`] passed.
    pub fn tap(&mut self, x: f64, y: f64) -> u64 {
        self.token = self.token.wrapping_add(1);
        self.current = Some(Indicator { x, y, down: false });
        self.token
    }

    /// The finger moved while touching.
    pub fn drag(&mut self, x: f64, y: f64) {
        if let Some(current) = self.current.as_mut().filter(|current| current.down) {
            current.x = x;
            current.y = y;
        }
    }

    /// The finger lifted at (`x`, `y`): the circle fades. Remove it with [`Self::expire`] and the
    /// token returned once [`RELEASE`] passed.
    pub fn release(&mut self, x: f64, y: f64) -> u64 {
        self.token = self.token.wrapping_add(1);
        self.current = Some(Indicator { x, y, down: false });
        self.token
    }

    /// The release of `token` is over: its circle goes, unless the finger touched again since.
    /// Whether it went.
    pub fn expire(&mut self, token: u64) -> bool {
        if token != self.token || self.current.is_none_or(|current| current.down) {
            return false;
        }
        self.current = None;
        true
    }

    /// Show clicks was turned off, or the view went: nothing to draw.
    pub fn clear(&mut self) {
        self.token = self.token.wrapping_add(1);
        self.current = None;
    }

    pub fn current(&self) -> Option<Indicator> {
        self.current
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shows_a_circle_while_pressed_and_removes_it_after_release() {
        let mut indicators = Indicators::default();
        indicators.press(20.0, 30.0);
        assert_eq!(
            indicators.current(),
            Some(Indicator {
                x: 20.0,
                y: 30.0,
                down: true
            })
        );
        let token = indicators.release(20.0, 30.0);
        assert_eq!(
            indicators.current().map(|current| current.down),
            Some(false)
        );
        assert!(indicators.expire(token));
        assert_eq!(indicators.current(), None);
    }

    #[test]
    fn the_circle_follows_a_drag() {
        let mut indicators = Indicators::default();
        indicators.press(20.0, 30.0);
        indicators.drag(40.0, 60.0);
        assert_eq!(
            indicators.current(),
            Some(Indicator {
                x: 40.0,
                y: 60.0,
                down: true
            })
        );
        // Not touching any more: a move is not a drag.
        let token = indicators.release(40.0, 60.0);
        indicators.drag(90.0, 90.0);
        assert_eq!(indicators.current().map(|current| current.x), Some(40.0));
        assert!(indicators.expire(token));
    }

    #[test]
    fn a_new_press_outlives_the_timer_of_the_last_release() {
        let mut indicators = Indicators::default();
        indicators.press(1.0, 1.0);
        let old = indicators.release(1.0, 1.0);
        indicators.press(5.0, 5.0);
        assert!(!indicators.expire(old));
        assert!(indicators.current().is_some_and(|current| current.down));
    }

    #[test]
    fn a_right_click_is_a_tap_that_fades_at_once() {
        let mut indicators = Indicators::default();
        let token = indicators.tap(8.0, 9.0);
        assert_eq!(
            indicators.current(),
            Some(Indicator {
                x: 8.0,
                y: 9.0,
                down: false
            })
        );
        // A tap has no drag to follow.
        indicators.drag(50.0, 50.0);
        assert_eq!(indicators.current().map(|current| current.x), Some(8.0));
        assert!(indicators.expire(token));
    }

    #[test]
    fn clearing_drops_the_circle_and_its_pending_release() {
        let mut indicators = Indicators::default();
        indicators.press(1.0, 1.0);
        let token = indicators.release(1.0, 1.0);
        indicators.clear();
        assert_eq!(indicators.current(), None);
        assert!(!indicators.expire(token));
    }
}
