import { describe, expect, it } from 'vitest';
import { computeStageHeight } from '../mirror-layout';

describe('computeStageHeight', () => {
  it('never exceeds the video height', () => {
    expect(computeStageHeight(600, 2160)).toBe(600);
  });

  it('uses the available screen height on large displays', () => {
    // 2160 * 0.9 - 52 - 40 = 1852, capped by the video height.
    expect(computeStageHeight(2400, 2160)).toBe(1852);
  });

  it('keeps a usable minimum on small screens', () => {
    expect(computeStageHeight(2400, 500)).toBe(480);
  });

  it('falls back to a fixed height when the display is unknown', () => {
    expect(computeStageHeight(2400, null)).toBe(780);
  });
});
