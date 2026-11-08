//! How big a mirror window is: the video fitted into the screen, with the toolbar above it and
//! the navigation bar under it, and turned with the phone. Ports `mirror-layout.ts` and the
//! sizing half of `setVideoLayout` in `mirror-window.service.ts` from the removed Electron app, as
//! plain numbers so every rule is unit tested; `macos/windows.rs` applies the result.

/// Height of the toolbar at the top of the window's content.
pub const TOOLBAR_HEIGHT: f64 = 52.0;
/// Height of the navigation bar under the screen, when it is shown.
pub const NAVIGATION_BAR_HEIGHT: f64 = 40.0;
/// The smallest content a mirror window can be resized to.
pub const MIN_CONTENT_WIDTH: f64 = 280.0;
pub const MIN_CONTENT_HEIGHT: f64 = 480.0;
/// A landscape phone is short, so its window may be shorter than a portrait one.
pub const MIN_CONTENT_HEIGHT_LANDSCAPE: f64 = 300.0;

/// Share of the work area the window may take, leaving room for the window's frame.
const WORK_AREA_SHARE: f64 = 0.9;
const MIN_STAGE_HEIGHT: f64 = 480.0;

/// A size in points.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Size {
    pub width: f64,
    pub height: f64,
}

impl Size {
    pub const fn new(width: f64, height: f64) -> Self {
        Self { width, height }
    }
}

/// JavaScript's `Math.round` (halves round up), so the sizes match Electron's to the point.
fn round(value: f64) -> f64 {
    (value + 0.5).floor()
}

/// Fits the video stage inside the work area keeping the video's aspect ratio. The video is never
/// upscaled beyond its own size. `extra_chrome_height` is any bar besides the toolbar.
pub fn compute_stage_size(video: Size, work_area: Size, extra_chrome_height: f64) -> Size {
    let max_height = MIN_STAGE_HEIGHT
        .max(round(work_area.height * WORK_AREA_SHARE) - TOOLBAR_HEIGHT - extra_chrome_height);
    let max_width = round(work_area.width * WORK_AREA_SHARE);
    let scale = 1f64
        .min(max_height / video.height)
        .min(max_width / video.width);
    Size::new(round(video.width * scale), round(video.height * scale))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Orientation {
    Portrait,
    Landscape,
}

/// A square video counts as portrait, the usual phone orientation.
pub fn orientation_of(size: Size) -> Orientation {
    if size.width > size.height {
        Orientation::Landscape
    } else {
        Orientation::Portrait
    }
}

/// The stage for a video whose orientation just changed: keeps the longest edge of the current
/// stage, so the window turns with the phone instead of snapping back to the default size.
pub fn rotated_stage_size(
    current_stage: Size,
    video: Size,
    work_area: Size,
    extra_chrome_height: f64,
) -> Size {
    let long_edge = current_stage.width.max(current_stage.height);
    let scale = long_edge / video.width.max(video.height);
    compute_stage_size(
        Size::new(round(video.width * scale), round(video.height * scale)),
        work_area,
        extra_chrome_height,
    )
}

/// The smallest content for a video of `orientation`.
pub fn min_content_size(orientation: Orientation) -> Size {
    Size::new(
        MIN_CONTENT_WIDTH,
        match orientation {
            Orientation::Portrait => MIN_CONTENT_HEIGHT,
            Orientation::Landscape => MIN_CONTENT_HEIGHT_LANDSCAPE,
        },
    )
}

/// What the window becomes: its content size and the smallest it may be resized to.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Resize {
    pub content: Size,
    pub min: Size,
}

/// What the window around the video is like when the video's size changes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct WindowNow {
    /// Its content size now.
    pub content: Size,
    /// The visible part of its screen (no menu bar, no Dock).
    pub work_area: Size,
    pub navigation_bar: bool,
    /// Full screen or zoomed: the user chose its size, a rotation leaves it alone.
    pub user_sized: bool,
}

/// One mirror window's layout over its life: sized to the first video, then turned with the
/// phone. It outlives a reconnect, so a stream that comes back does not undo the user's resize.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct WindowLayout {
    applied: bool,
    orientation: Option<Orientation>,
}

impl WindowLayout {
    /// The video is now `width`×`height`: how to resize the window, if at all.
    pub fn video_changed(&mut self, width: u32, height: u32, window: WindowNow) -> Option<Resize> {
        if width == 0 || height == 0 {
            return None;
        }
        let video = Size::new(f64::from(width), f64::from(height));
        let orientation = orientation_of(video);
        let previous = self.orientation.replace(orientation);
        let navigation_bar = if window.navigation_bar {
            NAVIGATION_BAR_HEIGHT
        } else {
            0.0
        };
        let chrome = TOOLBAR_HEIGHT + navigation_bar;
        let stage = if !self.applied {
            self.applied = true;
            compute_stage_size(video, window.work_area, navigation_bar)
        } else if previous.is_some_and(|previous| previous != orientation) && !window.user_sized {
            // The phone turned: turn the window with it.
            let current = Size::new(
                window.content.width,
                (window.content.height - chrome).max(0.0),
            );
            rotated_stage_size(current, video, window.work_area, navigation_bar)
        } else {
            return None;
        };
        let min = min_content_size(orientation);
        Some(Resize {
            content: Size::new(
                min.width.max(stage.width),
                min.height.max(stage.height + chrome),
            ),
            min,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORK_AREA: Size = Size::new(3840.0, 2160.0);

    // computeStageSize

    #[test]
    fn never_upscales_the_video() {
        assert_eq!(
            compute_stage_size(Size::new(360.0, 640.0), WORK_AREA, 0.0),
            Size::new(360.0, 640.0)
        );
    }

    #[test]
    fn fits_the_video_height_inside_the_work_area() {
        // 2160 * 0.9 - 52 = 1892
        assert_eq!(
            compute_stage_size(Size::new(1200.0, 2400.0), WORK_AREA, 0.0),
            Size::new(946.0, 1892.0)
        );
    }

    #[test]
    fn leaves_room_for_the_navigation_bar_when_it_is_shown() {
        // 2160 * 0.9 - 52 - 40 = 1852
        assert_eq!(
            compute_stage_size(Size::new(1200.0, 2400.0), WORK_AREA, 40.0),
            Size::new(926.0, 1852.0)
        );
    }

    #[test]
    fn fits_wide_videos_by_width() {
        assert_eq!(
            compute_stage_size(Size::new(5000.0, 1000.0), Size::new(1000.0, 2000.0), 0.0),
            Size::new(900.0, 180.0)
        );
    }

    #[test]
    fn keeps_a_usable_minimum_height_on_small_screens() {
        assert_eq!(
            compute_stage_size(Size::new(1200.0, 2400.0), Size::new(3000.0, 500.0), 0.0),
            Size::new(240.0, 480.0)
        );
    }

    // orientationOf

    #[test]
    fn tells_portrait_from_landscape_treating_a_square_as_portrait() {
        assert_eq!(
            orientation_of(Size::new(1080.0, 2400.0)),
            Orientation::Portrait
        );
        assert_eq!(
            orientation_of(Size::new(2400.0, 1080.0)),
            Orientation::Landscape
        );
        assert_eq!(
            orientation_of(Size::new(1000.0, 1000.0)),
            Orientation::Portrait
        );
    }

    // rotatedStageSize

    #[test]
    fn turns_the_stage_with_the_phone_keeping_its_longest_edge() {
        assert_eq!(
            rotated_stage_size(
                Size::new(450.0, 1000.0),
                Size::new(2400.0, 1080.0),
                WORK_AREA,
                0.0
            ),
            Size::new(1000.0, 450.0)
        );
    }

    #[test]
    fn turns_back_to_the_size_it_had_before() {
        assert_eq!(
            rotated_stage_size(
                Size::new(1000.0, 450.0),
                Size::new(1080.0, 2400.0),
                WORK_AREA,
                0.0
            ),
            Size::new(450.0, 1000.0)
        );
    }

    #[test]
    fn keeps_the_new_stage_inside_the_work_area() {
        // A tall portrait stage turning landscape would be 1892 wide, but only 900 fit.
        assert_eq!(
            rotated_stage_size(
                Size::new(800.0, 1892.0),
                Size::new(2400.0, 1080.0),
                Size::new(1000.0, 2160.0),
                0.0
            ),
            Size::new(900.0, 405.0)
        );
    }

    // setVideoLayout's sizing

    /// A 1440×900 laptop screen, minus the menu bar and the Dock.
    fn window(content: Size) -> WindowNow {
        WindowNow {
            content,
            work_area: Size::new(1440.0, 875.0),
            navigation_bar: false,
            user_sized: false,
        }
    }

    #[test]
    fn the_first_video_sizes_the_window_with_the_toolbar_above_it() {
        let mut layout = WindowLayout::default();
        // An S23 at max size 1920: 1080×2340 → 875 * 0.9 = 788 - 52 = 736 high.
        let resize = layout
            .video_changed(1080, 2340, window(Size::new(420.0, 860.0)))
            .unwrap();
        assert_eq!(resize.content, Size::new(340.0, 736.0 + TOOLBAR_HEIGHT));
        assert_eq!(resize.min, Size::new(280.0, 480.0));
    }

    #[test]
    fn the_navigation_bar_takes_its_room_from_the_stage() {
        let mut layout = WindowLayout::default();
        let mut now = window(Size::new(420.0, 860.0));
        now.navigation_bar = true;
        let resize = layout.video_changed(1080, 2340, now).unwrap();
        // 788 - 52 - 40 = 696 high for the video.
        assert_eq!(resize.content, Size::new(321.0, 696.0 + 52.0 + 40.0));
    }

    #[test]
    fn the_same_orientation_again_leaves_the_window_as_the_user_left_it() {
        let mut layout = WindowLayout::default();
        layout.video_changed(1080, 2340, window(Size::new(420.0, 860.0)));
        // A reconnect, or a new configuration at the same orientation.
        assert_eq!(
            layout.video_changed(1080, 2340, window(Size::new(600.0, 900.0))),
            None
        );
        assert_eq!(
            layout.video_changed(1080, 2400, window(Size::new(600.0, 900.0))),
            None
        );
    }

    #[test]
    fn a_rotation_turns_the_window_and_lowers_the_minimum_height() {
        let mut layout = WindowLayout::default();
        let first = layout
            .video_changed(1080, 2340, window(Size::new(420.0, 860.0)))
            .unwrap();
        let turned = layout
            .video_changed(2340, 1080, window(first.content))
            .unwrap();
        // The stage's long edge (736) becomes its width.
        assert_eq!(turned.content, Size::new(736.0, 340.0 + TOOLBAR_HEIGHT));
        assert_eq!(turned.min, Size::new(280.0, 300.0));
        // And back.
        let back = layout
            .video_changed(1080, 2340, window(turned.content))
            .unwrap();
        assert_eq!(back.content, first.content);
        assert_eq!(back.min, Size::new(280.0, 480.0));
    }

    #[test]
    fn full_screen_or_zoomed_windows_do_not_turn() {
        let mut layout = WindowLayout::default();
        layout.video_changed(1080, 2340, window(Size::new(420.0, 860.0)));
        let mut full = window(Size::new(1440.0, 900.0));
        full.user_sized = true;
        assert_eq!(layout.video_changed(2340, 1080, full), None);
        // The orientation was still noted: leaving full screen and turning back resizes.
        assert!(
            layout
                .video_changed(1080, 2340, window(Size::new(1440.0, 900.0)))
                .is_some()
        );
    }

    #[test]
    fn a_tiny_video_keeps_the_minimum_window() {
        let mut layout = WindowLayout::default();
        let resize = layout
            .video_changed(200, 300, window(Size::new(420.0, 860.0)))
            .unwrap();
        assert_eq!(resize.content, Size::new(280.0, 480.0));
    }

    #[test]
    fn an_empty_video_changes_nothing() {
        let mut layout = WindowLayout::default();
        assert_eq!(
            layout.video_changed(0, 2340, window(Size::new(420.0, 860.0))),
            None
        );
        // Not counted as the first layout.
        assert!(
            layout
                .video_changed(1080, 2340, window(Size::new(420.0, 860.0)))
                .is_some()
        );
    }
}
