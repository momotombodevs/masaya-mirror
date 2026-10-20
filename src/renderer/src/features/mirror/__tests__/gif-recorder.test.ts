// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GIF_MAX_FRAMES, GifRecorder, type RawFrame } from '../gif-recorder';

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
});
