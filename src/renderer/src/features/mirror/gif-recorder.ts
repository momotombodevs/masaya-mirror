import { fitWidth, type GifFrame, type Size } from './gif-encoder';

export const GIF_MAX_WIDTH = 480;
export const GIF_FPS = 10;
/** 30 s at 10 fps; longer recordings would make files and encoding times unreasonable. */
export const GIF_MAX_FRAMES = 300;

export type RawFrame = {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
};

/** Reads the current picture of the canvas, scaled down; null while it has nothing to show. */
export type FrameGrabber = () => RawFrame | null;

export function createCanvasFrameGrabber(
  canvas: HTMLCanvasElement,
  maxWidth = GIF_MAX_WIDTH,
): FrameGrabber {
  const scratch = document.createElement('canvas');
  return () => {
    if (canvas.width === 0 || canvas.height === 0) {
      return null;
    }
    const size: Size = fitWidth({ width: canvas.width, height: canvas.height }, maxWidth);
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
    return frames;
  }

  private sample(): void {
    const frame = this.grab();
    if (frame) {
      this.frames.push({ ...frame, at: this.now() });
    }
    if (this.frames.length >= GIF_MAX_FRAMES) {
      this.onLimit();
    }
  }
}
