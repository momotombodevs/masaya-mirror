import type { MirrorQualityPreset } from '../mirror/quality';

export type Preferences = {
  /** Quality new mirror windows start with. */
  readonly quality: MirrorQualityPreset;
};

export const DEFAULT_PREFERENCES: Preferences = { quality: 'high' };
