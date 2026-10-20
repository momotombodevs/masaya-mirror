import { describe, expect, it } from 'vitest';
import { encodeGif, fitWithin, type GifFrame } from '../gif-encoder';

function solidFrame(width: number, height: number, [r, g, b]: number[], delayMs = 100): GifFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    data.set([r ?? 0, g ?? 0, b ?? 0, 255], pixel * 4);
  }
  return { data, width, height, delayMs };
}

describe('fitWithin', () => {
  it('scales a portrait size down by its height, keeping the proportions', () => {
    expect(fitWithin({ width: 1080, height: 2400 }, 480)).toEqual({ width: 216, height: 480 });
  });

  it('scales a landscape size down by its width', () => {
    expect(fitWithin({ width: 2400, height: 1080 }, 480)).toEqual({ width: 480, height: 216 });
  });

  it('never scales up', () => {
    expect(fitWithin({ width: 300, height: 400 }, 480)).toEqual({ width: 300, height: 400 });
  });
});

describe('encodeGif', () => {
  it('produces a GIF89a file that holds every frame', async () => {
    const frames = [
      solidFrame(8, 6, [255, 0, 0]),
      solidFrame(8, 6, [0, 255, 0], 200),
      solidFrame(8, 6, [0, 0, 255]),
      solidFrame(8, 6, [255, 255, 0]),
    ];

    const bytes = await encodeGif(frames);

    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
    expect([bytes[6], bytes[7], bytes[8], bytes[9]]).toEqual([8, 0, 6, 0]);
    expect(bytes[bytes.length - 1]).toBe(0x3b);
    // Each frame starts with a graphic control extension (0x21 0xF9).
    const controls = bytes.reduce(
      (count, byte, at) => (byte === 0x21 && bytes[at + 1] === 0xf9 ? count + 1 : count),
      0,
    );
    expect(controls).toBe(frames.length);
  });
});
