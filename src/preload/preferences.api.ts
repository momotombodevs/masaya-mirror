import { ipcRenderer } from 'electron';
import { PREFERENCES_CHANNELS, type PreferencesResponse } from '../shared/ipc/preferences.contract';
import { LANGUAGE_PREFERENCES, type LanguagePreference } from '../shared/i18n/locale';
import type { Preferences } from '../shared/preferences/types';

export const preferencesApi = {
  getPreferences: (): Promise<PreferencesResponse> => ipcRenderer.invoke(PREFERENCES_CHANNELS.get),

  setPreferences: (preferences: Partial<Preferences>): Promise<PreferencesResponse> =>
    ipcRenderer.invoke(PREFERENCES_CHANNELS.set, preferences),

  /** Subscribes to language changes made in any window. Returns an unsubscribe function. */
  onLanguageChange: (listener: (language: LanguagePreference) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, language: unknown): void => {
      const known = LANGUAGE_PREFERENCES.find((candidate) => candidate === language);
      if (known) {
        listener(known);
      }
    };
    ipcRenderer.on(PREFERENCES_CHANNELS.languageChanged, handler);
    return () => ipcRenderer.removeListener(PREFERENCES_CHANNELS.languageChanged, handler);
  },
};
