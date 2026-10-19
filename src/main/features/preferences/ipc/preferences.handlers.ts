import { ipcMain } from 'electron';
import {
  PREFERENCES_CHANNELS,
  type PreferencesResponse,
} from '../../../../shared/ipc/preferences.contract';
import { ok } from '../../../../shared/ipc/result';
import { parsePreferencesPatch } from '../../../../shared/preferences/parse';
import type { PreferencesService } from '../preferences.service';

export function registerPreferencesIpcHandlers(preferences: PreferencesService): void {
  ipcMain.handle(PREFERENCES_CHANNELS.get, async (): Promise<PreferencesResponse> =>
    ok(preferences.get()),
  );

  ipcMain.handle(
    PREFERENCES_CHANNELS.set,
    async (_event, payload: unknown): Promise<PreferencesResponse> => {
      const patch = parsePreferencesPatch(payload);
      if (!patch.ok) {
        return patch;
      }
      preferences.set(patch.value);
      return ok(preferences.get());
    },
  );
}
