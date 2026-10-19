import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { ADB_DOWNLOAD_URL } from '../../../../shared/device/adb';
import {
  DEVICE_CHANNELS,
  type AdbStatusResponse,
  type ChooseAdbResponse,
  type OpenAdbDownloadResponse,
  type WifiResponse,
} from '../../../../shared/ipc/device.contract';
import { err, ok, type Result } from '../../../../shared/ipc/result';
import {
  isWifiDeviceId,
  parsePairingCode,
  parseWifiAddress,
} from '../../../../shared/ipc/validators';
import type { MirrorWindowService } from '../../mirror/mirror-window.service';
import type { PreferencesService } from '../../preferences/preferences.service';
import type { AdbService } from '../adb.service';

const NOT_ADB_MESSAGE = 'El archivo elegido no es adb.';

function readField(payload: unknown, field: string): unknown {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)[field]
    : undefined;
}

/**
 * Setup actions (choosing adb, pairing over Wi-Fi) belong to the device list. Mirror windows
 * only drive their own device, so they are turned away here as well as in the preload.
 */
export function registerSetupIpcHandlers(
  adbService: AdbService,
  preferences: PreferencesService,
  mirrorWindowService: MirrorWindowService,
): void {
  const handleFromMainWindow = <T>(
    channel: string,
    run: (payload: unknown, sender: Electron.WebContents) => Promise<Result<T>>,
  ): void => {
    ipcMain.handle(channel, async (event, payload: unknown): Promise<Result<T>> => {
      if (mirrorWindowService.isMirrorWindowSender(event.sender.id)) {
        return err('La ventana no puede ejecutar esta acción.');
      }
      return run(payload, event.sender);
    });
  };

  handleFromMainWindow(DEVICE_CHANNELS.adbStatus, async (): Promise<AdbStatusResponse> =>
    ok({ path: await adbService.getExecutablePath() }),
  );

  handleFromMainWindow(
    DEVICE_CHANNELS.chooseAdb,
    async (_payload, sender): Promise<ChooseAdbResponse> => {
      const parent = BrowserWindow.fromWebContents(sender);
      const options: Electron.OpenDialogOptions = {
        title: 'Elegir adb',
        properties: ['openFile'],
        ...(process.platform === 'win32'
          ? { filters: [{ name: 'adb', extensions: ['exe'] }] }
          : {}),
      };
      const choice = parent
        ? await dialog.showOpenDialog(parent, options)
        : await dialog.showOpenDialog(options);
      const [chosen] = choice.filePaths;
      if (choice.canceled || !chosen) {
        return ok({ path: null });
      }
      if (!(await adbService.verifyExecutable(chosen))) {
        return err(NOT_ADB_MESSAGE);
      }
      preferences.setAdbPath(chosen);
      adbService.setCustomPath(chosen);
      return ok({ path: chosen });
    },
  );

  handleFromMainWindow(
    DEVICE_CHANNELS.openAdbDownload,
    async (): Promise<OpenAdbDownloadResponse> => {
      await shell.openExternal(ADB_DOWNLOAD_URL);
      return ok(undefined);
    },
  );

  handleFromMainWindow(DEVICE_CHANNELS.pairWifi, async (payload): Promise<WifiResponse> => {
    const address = parseWifiAddress(readField(payload, 'address'));
    if (!address.ok) {
      return address;
    }
    const code = parsePairingCode(readField(payload, 'code'));
    if (!code.ok) {
      return code;
    }
    const paired = await adbService.pair(address.value, code.value);
    return paired.ok ? ok({ message: paired.value }) : paired;
  });

  handleFromMainWindow(DEVICE_CHANNELS.connectWifi, async (payload): Promise<WifiResponse> => {
    const address = parseWifiAddress(readField(payload, 'address'));
    if (!address.ok) {
      return address;
    }
    const connected = await adbService.connect(address.value);
    return connected.ok ? ok({ message: connected.value }) : connected;
  });

  handleFromMainWindow(DEVICE_CHANNELS.disconnect, async (payload): Promise<WifiResponse> => {
    const deviceId = readField(payload, 'deviceId');
    if (typeof deviceId !== 'string' || !isWifiDeviceId(deviceId)) {
      return err('Solo se pueden desconectar dispositivos Wi-Fi.');
    }
    const disconnected = await adbService.disconnect(deviceId);
    return disconnected.ok ? ok({ message: disconnected.value }) : disconnected;
  });
}
