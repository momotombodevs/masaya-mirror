/** Height of the toolbar inside the mirror window's content area. */
export const TOOLBAR_CONTENT_HEIGHT = 52;

/** Space kept free around the window so it fits comfortably on screen. */
const SCREEN_MARGIN = 40;
const MIN_STAGE_HEIGHT = 480;
const FALLBACK_STAGE_HEIGHT = 780;

/**
 * Picks the height of the video stage. The video is never upscaled beyond its
 * own height, and it fills as much of the work area as the screen allows.
 */
export function computeStageHeight(videoHeight: number, workAreaHeight: number | null): number {
  const screenBudget =
    workAreaHeight === null
      ? FALLBACK_STAGE_HEIGHT
      : Math.max(
          MIN_STAGE_HEIGHT,
          Math.round(workAreaHeight * 0.9) - TOOLBAR_CONTENT_HEIGHT - SCREEN_MARGIN,
        );
  return Math.min(screenBudget, videoHeight);
}
