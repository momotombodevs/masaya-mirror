import { describe, expect, it } from 'vitest';
import { DEFAULT_MIRROR_OPTIONS } from '../types';
import { applyQualityPreset, qualityPresetOf } from '../quality';

describe('quality presets', () => {
  it('applies size and bitrate while keeping the other options', () => {
    const options = applyQualityPreset(DEFAULT_MIRROR_OPTIONS, 'max');
    expect(options).toEqual({
      ...DEFAULT_MIRROR_OPTIONS,
      maxSize: 2560,
      videoBitRate: 32_000_000,
    });
  });

  it('identifies the preset that matches the options', () => {
    expect(qualityPresetOf(DEFAULT_MIRROR_OPTIONS)).toBe('high');
    expect(qualityPresetOf(applyQualityPreset(DEFAULT_MIRROR_OPTIONS, 'balanced'))).toBe(
      'balanced',
    );
  });

  it('returns null for custom values', () => {
    expect(qualityPresetOf({ ...DEFAULT_MIRROR_OPTIONS, maxSize: 1000 })).toBeNull();
  });
});
