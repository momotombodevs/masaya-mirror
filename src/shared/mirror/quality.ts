import type { MirrorOptions } from './types';

export type MirrorQualityPreset = 'balanced' | 'high' | 'max';

type PresetValues = Pick<MirrorOptions, 'maxSize' | 'videoBitRate'>;

export const MIRROR_QUALITY_PRESETS: Record<
  MirrorQualityPreset,
  { readonly label: string; readonly detail: string; readonly values: PresetValues }
> = {
  balanced: {
    label: 'Equilibrada',
    detail: '1280 px · 8 Mbps',
    values: { maxSize: 1280, videoBitRate: 8_000_000 },
  },
  high: {
    label: 'Alta',
    detail: '1920 px · 16 Mbps',
    values: { maxSize: 1920, videoBitRate: 16_000_000 },
  },
  max: {
    label: 'Máxima',
    detail: '2560 px · 32 Mbps',
    values: { maxSize: 2560, videoBitRate: 32_000_000 },
  },
};

export const MIRROR_QUALITY_ORDER: readonly MirrorQualityPreset[] = ['balanced', 'high', 'max'];

export function applyQualityPreset(
  options: MirrorOptions,
  preset: MirrorQualityPreset,
): MirrorOptions {
  return { ...options, ...MIRROR_QUALITY_PRESETS[preset].values };
}

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
