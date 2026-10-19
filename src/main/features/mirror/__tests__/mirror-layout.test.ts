import { describe, expect, it } from 'vitest';
import { computeStageSize } from '../mirror-layout';

const workArea = { width: 3840, height: 2160 };

describe('computeStageSize', () => {
  it('never upscales the video', () => {
    expect(computeStageSize({ width: 360, height: 640 }, workArea)).toEqual({
      width: 360,
      height: 640,
    });
  });

  it('fits the video height inside the work area', () => {
    // 2160 * 0.9 - 52 = 1892
    expect(computeStageSize({ width: 1200, height: 2400 }, workArea)).toEqual({
      width: 946,
      height: 1892,
    });
  });

  it('leaves room for the navigation bar when it is shown', () => {
    // 2160 * 0.9 - 52 - 40 = 1852
    expect(computeStageSize({ width: 1200, height: 2400 }, workArea, 40)).toEqual({
      width: 926,
      height: 1852,
    });
  });

  it('fits wide videos by width', () => {
    expect(computeStageSize({ width: 5000, height: 1000 }, { width: 1000, height: 2000 })).toEqual({
      width: 900,
      height: 180,
    });
  });

  it('keeps a usable minimum height on small screens', () => {
    expect(computeStageSize({ width: 1200, height: 2400 }, { width: 3000, height: 500 })).toEqual({
      width: 240,
      height: 480,
    });
  });
});
