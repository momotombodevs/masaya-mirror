/** Height of the toolbar inside the mirror window's content area. */
export const TOOLBAR_CONTENT_HEIGHT = 52;

/** Height of the navigation bar under the screen, when it is shown. */
export const NAVIGATION_BAR_HEIGHT = 40;

/** Share of the work area the window may occupy, leaving room for window chrome. */
const WORK_AREA_SHARE = 0.9;
const MIN_STAGE_HEIGHT = 480;

export type Size = { readonly width: number; readonly height: number };

/**
 * Fits the video stage inside the work area keeping the video aspect ratio.
 * The video is never upscaled beyond its own size. `extraChromeHeight` is any bar besides the toolbar.
 */
export function computeStageSize(video: Size, workArea: Size, extraChromeHeight = 0): Size {
  const maxHeight = Math.max(
    MIN_STAGE_HEIGHT,
    Math.round(workArea.height * WORK_AREA_SHARE) - TOOLBAR_CONTENT_HEIGHT - extraChromeHeight,
  );
  const maxWidth = Math.round(workArea.width * WORK_AREA_SHARE);
  const scale = Math.min(1, maxHeight / video.height, maxWidth / video.width);

  return {
    width: Math.round(video.width * scale),
    height: Math.round(video.height * scale),
  };
}

export type Orientation = 'portrait' | 'landscape';

/** A square video counts as portrait, the usual phone orientation. */
export function orientationOf(size: Size): Orientation {
  return size.width > size.height ? 'landscape' : 'portrait';
}

/**
 * Stage for a video whose orientation just changed: keeps the longest edge of the current stage,
 * so the window turns with the phone instead of snapping back to the default size.
 */
export function rotatedStageSize(
  currentStage: Size,
  video: Size,
  workArea: Size,
  extraChromeHeight = 0,
): Size {
  const longEdge = Math.max(currentStage.width, currentStage.height);
  const scale = longEdge / Math.max(video.width, video.height);
  return computeStageSize(
    { width: Math.round(video.width * scale), height: Math.round(video.height * scale) },
    workArea,
    extraChromeHeight,
  );
}
