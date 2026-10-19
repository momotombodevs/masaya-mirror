import { ipcMain } from 'electron';
import {
  PREFERENCES_CHANNELS,
  type PreferencesResponse,
} from '../../../../shared/ipc/preferences.contract';
import { ok } from '../../../../shared/ipc/result';
import { parsePreferencesPatch } from '../../../../shared/preferences/parse';
import type { Preferences } from '../../../../shared/preferences/types';
import type { PreferencesService } from '../preferences.service';

type PreferencesHandlerHooks = {
  /** Called after a patch that changed the language was saved. */
  readonly onLanguageChange: (language: Preferences['language']) => void;
};

export function registerPreferencesIpcHandlers(
  preferences: PreferencesService,
  hooks: PreferencesHandlerHooks,
): void {
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
      const before = preferences.get().language;
      preferences.set(patch.value);
      const after = preferences.get().language;
      if (after !== before) {
        hooks.onLanguageChange(after);
      }
      return ok(preferences.get());
    },
  );
}
