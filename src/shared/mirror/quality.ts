import type { MirrorOptions } from './types';

export type MirrorQualityPreset = 'balanced' | 'high' | 'max';

type PresetValues = Pick<MirrorOptions, 'maxSize' | 'videoBitRate'>;

/** Video settings of each preset. Names and descriptions live in the i18n messages. */
export const MIRROR_QUALITY_PRESETS: Record<
  MirrorQualityPreset,
  { readonly values: PresetValues }
> = {
  balanced: {
    values: { maxSize: 1280, videoBitRate: 8_000_000 },
  },
  high: {
    values: { maxSize: 1920, videoBitRate: 16_000_000 },
  },
  max: {
    values: { maxSize: 2560, videoBitRate: 32_000_000 },
  },
};

export const MIRROR_QUALITY_ORDER: readonly MirrorQualityPreset[] = ['balanced', 'high', 'max'];

/** Returns the preset that matches the options, or null for custom values. */
export function qualityPresetOf(options: MirrorOptions): MirrorQualityPreset | null {
  for (const preset of MIRROR_QUALITY_ORDER) {
    const { values } = MIRROR_QUALITY_PRESETS[preset];
    if (values.maxSize === options.maxSize && values.videoBitRate === options.videoBitRate) {
      return preset;
    }
  }
  return null;
}
