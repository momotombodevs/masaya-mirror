import { BrowserWindow, dialog, shell } from 'electron';
import { ADB_DOWNLOAD_URL } from '../../../../shared/device/adb';
import {
  DEVICE_CHANNELS,
  type AdbStatusResponse,
  type ChooseAdbResponse,
  type OpenAdbDownloadResponse,
  type QrPairStartResponse,
  type WifiResponse,
} from '../../../../shared/ipc/device.contract';
import { err, mapResult, ok, type Result } from '../../../../shared/ipc/result';
import { isWifiDeviceId } from '../../../../shared/ipc/validators';
import type { MirrorWindowService } from '../../mirror/mirror-window.service';
import type { PreferencesService } from '../../preferences/preferences.service';
import type { AdbService } from '../adb.service';
import type { QrPairingService } from '../qr-pairing.service';
import { mt } from '../../../i18n';
import { fromMainWindow, handleIpc, type IpcRequest } from '../../../ipc/handle-ipc';

function readField(payload: unknown, field: string): unknown {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)[field]
    : undefined;
}

/** Setup actions (choosing adb, pairing over Wi-Fi) belong to the device list window. */
export function registerSetupIpcHandlers(
  adbService: AdbService,
  preferences: PreferencesService,
  mirrorWindowService: MirrorWindowService,
  qrPairing: QrPairingService,
): void {
  const handleFromMainWindow = <T>(
    channel: string,
    run: (request: IpcRequest<object>) => Promise<Result<T>>,
  ): void => handleIpc(channel, fromMainWindow(mirrorWindowService), run);

  handleFromMainWindow(DEVICE_CHANNELS.adbStatus, async (): Promise<AdbStatusResponse> =>
    ok({ path: await adbService.getExecutablePath() }),
  );

  handleFromMainWindow(DEVICE_CHANNELS.chooseAdb, async ({ event }): Promise<ChooseAdbResponse> => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: mt('main.chooseAdbTitle'),
      properties: ['openFile'],
      ...(process.platform === 'win32' ? { filters: [{ name: 'adb', extensions: ['exe'] }] } : {}),
    };
    const choice = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    const [chosen] = choice.filePaths;
    if (choice.canceled || !chosen) {
      return ok({ path: null });
    }
    if (!(await adbService.verifyExecutable(chosen))) {
      return err(mt('main.notAdb'));
    }
    preferences.setAdbPath(chosen);
    adbService.setCustomPath(chosen);
    return ok({ path: chosen });
  });

  handleFromMainWindow(
    DEVICE_CHANNELS.openAdbDownload,
    async (): Promise<OpenAdbDownloadResponse> => {
      await shell.openExternal(ADB_DOWNLOAD_URL);
      return ok(undefined);
    },
  );

  handleFromMainWindow(DEVICE_CHANNELS.disconnect, async ({ payload }): Promise<WifiResponse> => {
    const deviceId = readField(payload, 'deviceId');
    if (typeof deviceId !== 'string' || !isWifiDeviceId(deviceId)) {
      return err(mt('main.wifiOnlyDisconnect'));
    }
    return mapResult(await adbService.disconnect(deviceId), (message) => ({ message }));
  });

  handleFromMainWindow(DEVICE_CHANNELS.qrPairStart, async (): Promise<QrPairStartResponse> =>
    qrPairing.start(),
  );

  handleFromMainWindow(DEVICE_CHANNELS.qrPairWait, async ({ payload }): Promise<WifiResponse> => {
    const sessionId = readField(payload, 'sessionId');
    if (typeof sessionId !== 'string') {
      return err(mt('main.invalidPairingSession'));
    }
    return mapResult(await qrPairing.wait(sessionId), (message) => ({ message }));
  });

  handleFromMainWindow(DEVICE_CHANNELS.qrPairCancel, async ({ payload }): Promise<Result<void>> => {
    const sessionId = readField(payload, 'sessionId');
    if (typeof sessionId === 'string') {
      qrPairing.cancel(sessionId);
    }
    return ok(undefined);
  });
}
