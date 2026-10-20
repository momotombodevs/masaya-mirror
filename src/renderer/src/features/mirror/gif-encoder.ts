import { applyPalette, GIFEncoder, quantize } from 'gifenc';

export type GifFrame = {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** How long this frame stays on screen. */
  readonly delayMs: number;
};

export type Size = { readonly width: number; readonly height: number };

/** Scales a size down to `maxWidth` keeping its proportions; never scales up. */
export function fitWidth(size: Size, maxWidth: number): Size {
  if (size.width <= maxWidth) {
    return size;
  }
  const scale = maxWidth / size.width;
  return { width: maxWidth, height: Math.max(1, Math.round(size.height * scale)) };
}

const MAX_COLORS = 256;
/** Encoding is CPU-bound, so the event loop gets a turn every few frames to keep the window alive. */
const FRAMES_PER_TURN = 3;

const nextTurn = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** Encodes the frames as an animated GIF that loops forever, each with its own palette. */
export async function encodeGif(frames: readonly GifFrame[]): Promise<Uint8Array> {
  const encoder = GIFEncoder();
  for (const [position, frame] of frames.entries()) {
    const palette = quantize(frame.data, MAX_COLORS, { format: 'rgb444' });
    const index = applyPalette(frame.data, palette, 'rgb444');
    encoder.writeFrame(index, frame.width, frame.height, { palette, delay: frame.delayMs });
    if ((position + 1) % FRAMES_PER_TURN === 0) {
      await nextTurn();
    }
  }
  encoder.finish();
  return encoder.bytes();
}
