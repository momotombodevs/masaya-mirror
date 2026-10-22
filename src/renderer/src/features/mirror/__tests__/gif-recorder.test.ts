// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GIF_MAX_BYTES,
  GIF_MAX_EDGE,
  GIF_MAX_FRAMES,
  GifRecorder,
  type RawFrame,
} from '../gif-recorder';

const frame: RawFrame = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

describe('GifRecorder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('samples ten times a second and keeps the real time between frames as the delay', () => {
    let clock = 0;
    const recorder = new GifRecorder(
      () => frame,
      vi.fn(),
      () => clock,
    );

    recorder.start();
    clock = 100;
    vi.advanceTimersByTime(100);
    clock = 260;
    vi.advanceTimersByTime(100);
    const frames = recorder.stop();

    expect(frames.map((f) => f.delayMs)).toEqual([100, 160, 100]);
  });

  it('skips moments when the canvas has nothing to show', () => {
    const grab = vi.fn().mockReturnValueOnce(null).mockReturnValue(frame);
    const recorder = new GifRecorder(grab, vi.fn());

    recorder.start();
    vi.advanceTimersByTime(200);

    expect(recorder.stop()).toHaveLength(2);
  });

  it('stops sampling after stop and starts clean next time', () => {
    const grab = vi.fn(() => frame);
    const recorder = new GifRecorder(grab, vi.fn());
    recorder.start();
    recorder.stop();
    grab.mockClear();

    vi.advanceTimersByTime(1_000);

    expect(grab).not.toHaveBeenCalled();
    expect(recorder.stop()).toEqual([]);
  });

  it('tells the owner when the frame limit is reached', () => {
    const onLimit = vi.fn();
    const recorder = new GifRecorder(() => frame, onLimit);

    recorder.start();
    vi.advanceTimersByTime(GIF_MAX_FRAMES * 100);

    expect(onLimit).toHaveBeenCalled();
    recorder.stop();
  });

  it('stops by memory before the frame limit when frames are large', () => {
    const big: RawFrame = {
      data: new Uint8ClampedArray(GIF_MAX_EDGE * GIF_MAX_EDGE * 4),
      width: GIF_MAX_EDGE,
      height: GIF_MAX_EDGE,
    };
    let kept = 0;
    const recorder: GifRecorder = new GifRecorder(
      () => big,
      () => {
        kept = recorder.stop().length; // what the owner does when told about the limit
      },
    );

    recorder.start();
    vi.advanceTimersByTime(GIF_MAX_FRAMES * 100);

    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(GIF_MAX_FRAMES);
    expect(kept * big.data.byteLength).toBeLessThan(GIF_MAX_BYTES + big.data.byteLength);
  });

  it('keeps the worst case well under 150 MB', () => {
    const worstFrameBytes = GIF_MAX_EDGE * GIF_MAX_EDGE * 4;

    expect(GIF_MAX_BYTES + worstFrameBytes).toBeLessThan(150 * 1024 * 1024);
    expect(GIF_MAX_FRAMES * 216 * 480 * 4).toBeLessThan(150 * 1024 * 1024);
  });
});
