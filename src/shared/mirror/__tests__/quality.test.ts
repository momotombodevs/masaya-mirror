import { describe, expect, it } from 'vitest';
import { DEFAULT_MIRROR_OPTIONS } from '../types';
import { MIRROR_QUALITY_PRESETS, qualityPresetOf } from '../quality';

describe('quality presets', () => {
  it('identifies the preset that matches the options', () => {
    expect(qualityPresetOf(DEFAULT_MIRROR_OPTIONS)).toBe('high');
    expect(
      qualityPresetOf({ ...DEFAULT_MIRROR_OPTIONS, ...MIRROR_QUALITY_PRESETS.balanced.values }),
    ).toBe('balanced');
  });

  it('returns null for custom values', () => {
    expect(qualityPresetOf({ ...DEFAULT_MIRROR_OPTIONS, maxSize: 1000 })).toBeNull();
  });
});
