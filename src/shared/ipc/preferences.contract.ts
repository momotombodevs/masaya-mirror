import type { Preferences } from '../preferences/types';
import type { Result } from './result';

export const PREFERENCES_CHANNELS = {
  get: 'preferences:get',
  set: 'preferences:set',
} as const;

export type PreferencesResponse = Result<Preferences>;
