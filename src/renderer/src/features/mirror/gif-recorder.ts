import { fitWithin, type GifFrame, type Size } from './gif-encoder';

/** Longest edge of a recorded frame; a phone screen becomes about 216×480. */
export const GIF_MAX_EDGE = 480;
const GIF_FPS = 10;
/** 30 s at 10 fps; longer recordings would make files and encoding times unreasonable. */
export const GIF_MAX_FRAMES = 300;
/**
 * Raw RGBA frames stay in memory until the recording ends. The recording stops once they take
 * this much, so the worst case is this plus one frame (a 480×480 frame is 0.9 MB), whatever the
 * shape of the screen: a phone reaches about 230 frames, a square window about 100.
 */
export const GIF_MAX_BYTES = 96 * 1024 * 1024;

export type RawFrame = {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
};

/** Reads the current picture of the canvas, scaled down; null while it has nothing to show. */
export type FrameGrabber = () => RawFrame | null;

export function createCanvasFrameGrabber(
  canvas: HTMLCanvasElement,
  maxEdge = GIF_MAX_EDGE,
): FrameGrabber {
  const scratch = document.createElement('canvas');
  return () => {
    if (canvas.width === 0 || canvas.height === 0) {
      return null;
    }
    const size: Size = fitWithin({ width: canvas.width, height: canvas.height }, maxEdge);
    scratch.width = size.width;
    scratch.height = size.height;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (!context) {
      return null;
    }
    context.drawImage(canvas, 0, 0, size.width, size.height);
    return { ...size, data: context.getImageData(0, 0, size.width, size.height).data };
  };
}

type Timed = RawFrame & { readonly at: number };

/** Samples the mirror a few times per second; the frame delays follow the real timing. */
export class GifRecorder {
  private frames: Timed[] = [];
  private bytes = 0;
  private timer: number | null = null;

  constructor(
    private readonly grab: FrameGrabber,
    private readonly onLimit: () => void,
    private readonly now: () => number = () => performance.now(),
  ) {}

  start(): void {
    this.sample();
    this.timer = window.setInterval(() => this.sample(), 1000 / GIF_FPS);
  }

  /** Stops sampling and returns the frames recorded so far. */
  stop(): GifFrame[] {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
    const frameMs = Math.round(1000 / GIF_FPS);
    const frames = this.frames.map((frame, position): GifFrame => {
      const next = this.frames[position + 1];
      const delayMs = next ? Math.max(20, Math.round(next.at - frame.at)) : frameMs;
      return { data: frame.data, width: frame.width, height: frame.height, delayMs };
    });
    this.frames = [];
    this.bytes = 0;
    return frames;
  }

  private sample(): void {
    const frame = this.grab();
    if (frame) {
      this.frames.push({ ...frame, at: this.now() });
      this.bytes += frame.data.byteLength;
    }
    if (this.frames.length >= GIF_MAX_FRAMES || this.bytes >= GIF_MAX_BYTES) {
      this.onLimit();
    }
  }
}
