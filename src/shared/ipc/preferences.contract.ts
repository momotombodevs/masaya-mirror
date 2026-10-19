import type { Preferences } from '../preferences/types';
import type { Result } from './result';

export const PREFERENCES_CHANNELS = {
  get: 'preferences:get',
  set: 'preferences:set',
  /** Main → windows: the saved language changed, so open windows can follow. */
  languageChanged: 'preferences:language-changed',
} as const;

export type PreferencesResponse = Result<Preferences>;
