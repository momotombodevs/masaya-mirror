import { BrowserWindow, dialog } from 'electron';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { DEVICE_CHANNELS, type InstallApkResponse } from '../../../../shared/ipc/device.contract';
import { err, mapResult, ok, type Result } from '../../../../shared/ipc/result';
import { handleOwnedDevice } from '../../../ipc/handle-ipc';
import type { MirrorWindowService } from '../../mirror/mirror-window.service';
import type { AdbService } from '../adb.service';
import { mt } from '../../../i18n';

async function validateApkPath(candidate: unknown): Promise<Result<string>> {
  if (typeof candidate !== 'string' || !path.isAbsolute(candidate)) {
    return err(mt('main.notApk'));
  }
  if (path.extname(candidate).toLowerCase() !== '.apk') {
    return err(mt('main.notApk'));
  }
  try {
    return (await stat(candidate)).isFile() ? ok(candidate) : err(mt('main.notApk'));
  } catch {
    return err(mt('main.fileNotFound'));
  }
}

async function pickApk(sender: Electron.WebContents): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: mt('main.installApkTitle'),
    properties: ['openFile'],
    filters: [{ name: 'APK', extensions: ['apk'] }],
  };
  const parent = BrowserWindow.fromWebContents(sender);
  const choice = parent
    ? await dialog.showOpenDialog(parent, options)
    : await dialog.showOpenDialog(options);
  return choice.canceled ? null : (choice.filePaths[0] ?? null);
}

/** Installs an APK on the device owned by the requesting mirror window. */
export function registerApkIpcHandlers(
  adbService: AdbService,
  mirrorWindowService: MirrorWindowService,
): void {
  handleOwnedDevice<{ installed: boolean }>(
    DEVICE_CHANNELS.installApk,
    mirrorWindowService,
    async ({ deviceId, body, sender }): Promise<InstallApkResponse> => {
      const requested = body.path ?? (await pickApk(sender));
      if (requested === null) {
        return ok({ installed: false });
      }
      const apkPath = await validateApkPath(requested);
      if (!apkPath.ok) {
        return apkPath;
      }
      const installed = await adbService.installApk(deviceId, apkPath.value);
      return mapResult(installed, () => ({ installed: true }));
    },
  );
}
