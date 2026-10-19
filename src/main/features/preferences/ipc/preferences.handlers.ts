import { ipcMain } from 'electron';
import {
  PREFERENCES_CHANNELS,
  type PreferencesResponse,
} from '../../../../shared/ipc/preferences.contract';
import { err, ok } from '../../../../shared/ipc/result';
import { MIRROR_QUALITY_ORDER } from '../../../../shared/mirror/quality';
import type { PreferencesService } from '../preferences.service';

export function registerPreferencesIpcHandlers(preferences: PreferencesService): void {
  ipcMain.handle(PREFERENCES_CHANNELS.get, async (): Promise<PreferencesResponse> =>
    ok(preferences.get()),
  );

  ipcMain.handle(
    PREFERENCES_CHANNELS.set,
    async (_event, payload: unknown): Promise<PreferencesResponse> => {
      const quality = (payload as { quality?: unknown } | null)?.quality;
      const preset = MIRROR_QUALITY_ORDER.find((candidate) => candidate === quality);
      if (!preset) {
        return err('Preferencia inválida.');
      }
      preferences.setQuality(preset);
      return ok(preferences.get());
    },
  );
}
