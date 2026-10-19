import { ipcRenderer } from 'electron';
import { PREFERENCES_CHANNELS, type PreferencesResponse } from '../shared/ipc/preferences.contract';
import type { Preferences } from '../shared/preferences/types';

export const preferencesApi = {
  getPreferences: (): Promise<PreferencesResponse> => ipcRenderer.invoke(PREFERENCES_CHANNELS.get),

  setPreferences: (preferences: Partial<Preferences>): Promise<PreferencesResponse> =>
    ipcRenderer.invoke(PREFERENCES_CHANNELS.set, preferences),
};
