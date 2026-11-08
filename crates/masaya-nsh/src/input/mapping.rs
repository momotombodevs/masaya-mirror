//! Where a point of the mirror view lands on the phone's screen.
//!
//! The video keeps its aspect ratio inside the view, so it is letterboxed: bars above and below
//! or on the sides. The renderer's mapping (`useMirrorInput.ts`) assumed the canvas had the
//! video's aspect, so a click on a bar landed off by the bar's size; this one maps through the
//! content's own rectangle. AppKit's views put their origin at the bottom left unless flipped.

/// The farthest a pointer may be from the screen's origin: `masaya_core` rejects a touch past
/// ±10 000 (its largest video dimension), and a lost up would leave the finger stuck down.
pub const MAX_POINTER_REACH: i32 = 10_000;

/// A size in view points.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct ViewSize {
    pub width: f64,
    pub height: f64,
}

/// The video's size in pixels, as scrcpy reports it.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct VideoSize {
    pub width: u32,
    pub height: u32,
}

/// A rectangle in view points, origin at the top left.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl Rect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x < self.x + self.width && y >= self.y && y < self.y + self.height
    }
}

fn usable(value: f64) -> bool {
    value.is_finite() && value > 0.0
}

/// The part of the view the video fills, centered, with its aspect ratio kept. `None` while the
/// view or the video has no area.
pub fn content_rect(view: ViewSize, video: VideoSize) -> Option<Rect> {
    if !usable(view.width) || !usable(view.height) || video.width == 0 || video.height == 0 {
        return None;
    }
    let scale = (view.width / f64::from(video.width)).min(view.height / f64::from(video.height));
    let width = f64::from(video.width) * scale;
    let height = f64::from(video.height) * scale;
    Some(Rect {
        x: (view.width - width) / 2.0,
        y: (view.height - height) / 2.0,
        width,
        height,
    })
}

/// The phone pixel under `point` (view points; `flipped` as `NSView::isFlipped`).
///
/// A press outside the video (on a bar) is `None`. While the pointer is `captured` (a drag that
/// started on the video), points are not limited to the video, negative ones included, so a
/// drag off the edge still ends where the finger left; they stay within
/// ±[`MAX_POINTER_REACH`], so its up is always accepted. `None` while there is no content.
pub fn map_point(
    point: (f64, f64),
    view: ViewSize,
    video: VideoSize,
    flipped: bool,
    captured: bool,
) -> Option<(i32, i32)> {
    let rect = content_rect(view, video)?;
    let (x, y) = point;
    if !x.is_finite() || !y.is_finite() {
        return None;
    }
    let y = if flipped { y } else { view.height - y };
    if !captured && !rect.contains(x, y) {
        return None;
    }
    let to_video = |offset: f64, size: f64, pixels: u32| offset / size * f64::from(pixels);
    let vx = to_video(x - rect.x, rect.width, video.width).round();
    let vy = to_video(y - rect.y, rect.height, video.height).round();
    if captured {
        let reach = f64::from(MAX_POINTER_REACH);
        let clamp = |value: f64| value.clamp(-reach, reach) as i32;
        return Some((clamp(vx), clamp(vy)));
    }
    // Rounding the last half pixel would land one past the edge.
    let max = |pixels: u32| f64::from(pixels - 1);
    Some((
        vx.min(max(video.width)) as i32,
        vy.min(max(video.height)) as i32,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const PHONE: VideoSize = VideoSize {
        width: 1080,
        height: 2400,
    };

    fn view(width: f64, height: f64) -> ViewSize {
        ViewSize { width, height }
    }

    #[test]
    fn a_wide_view_gets_bars_on_the_sides() {
        let rect = content_rect(view(1000.0, 1000.0), PHONE).unwrap();
        assert!((rect.height - 1000.0).abs() < 1e-9);
        assert!((rect.width - 450.0).abs() < 1e-9);
        assert!((rect.x - 275.0).abs() < 1e-9);
        assert_eq!(rect.y, 0.0);
    }

    #[test]
    fn a_tall_view_gets_bars_above_and_below() {
        let rect = content_rect(view(540.0, 2000.0), PHONE).unwrap();
        assert!((rect.width - 540.0).abs() < 1e-9);
        assert!((rect.height - 1200.0).abs() < 1e-9);
        assert!((rect.y - 400.0).abs() < 1e-9);
    }

    #[test]
    fn no_area_no_content() {
        assert_eq!(content_rect(view(0.0, 100.0), PHONE), None);
        assert_eq!(content_rect(view(100.0, f64::NAN), PHONE), None);
        let empty = VideoSize {
            width: 0,
            height: 0,
        };
        assert_eq!(content_rect(view(100.0, 100.0), empty), None);
        assert_eq!(
            map_point((1.0, 1.0), view(0.0, 0.0), PHONE, true, false),
            None
        );
    }

    #[test]
    fn maps_through_the_letterbox() {
        // Content at x 275..725 in a 1000×1000 view.
        let v = view(1000.0, 1000.0);
        assert_eq!(map_point((275.0, 0.0), v, PHONE, true, false), Some((0, 0)));
        assert_eq!(
            map_point((500.0, 500.0), v, PHONE, true, false),
            Some((540, 1200))
        );
        // The renderer's view-wide mapping sent the content's left edge to x 297, not 0.
        assert_eq!(
            map_point((724.9, 999.9), v, PHONE, true, false),
            Some((1079, 2399))
        );
    }

    #[test]
    fn flips_y_for_an_unflipped_view() {
        let v = view(450.0, 1000.0);
        // Bottom-left origin: y 1000 is the top of the view.
        assert_eq!(
            map_point((0.0, 1000.0), v, PHONE, false, false),
            Some((0, 0))
        );
        assert_eq!(
            map_point((0.0, 250.0), v, PHONE, false, false),
            Some((0, 1800))
        );
        assert_eq!(
            map_point((0.0, 250.0), v, PHONE, true, false),
            Some((0, 600))
        );
    }

    #[test]
    fn a_press_on_a_bar_is_ignored() {
        let v = view(1000.0, 1000.0);
        assert_eq!(map_point((100.0, 500.0), v, PHONE, true, false), None);
        assert_eq!(map_point((725.0, 500.0), v, PHONE, true, false), None);
        assert_eq!(map_point((f64::NAN, 500.0), v, PHONE, true, false), None);
    }

    #[test]
    fn a_captured_drag_is_not_clamped() {
        let v = view(1000.0, 1000.0);
        assert_eq!(
            map_point((50.0, 500.0), v, PHONE, true, true),
            Some((-540, 1200))
        );
        assert_eq!(
            map_point((500.0, -100.0), v, PHONE, true, true),
            Some((540, -240))
        );
        // Far off the window the drag stays within what masaya-core accepts.
        assert_eq!(
            map_point((1e300, -1e300), v, PHONE, true, true),
            Some((MAX_POINTER_REACH, -MAX_POINTER_REACH))
        );
    }
}
