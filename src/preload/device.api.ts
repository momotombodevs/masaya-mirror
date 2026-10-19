import { ipcRenderer } from 'electron';
import {
  DEVICE_CHANNELS,
  type AdbStatusResponse,
  type ChooseAdbResponse,
  type DisconnectRequest,
  type GetDeviceSettingsResponse,
  type InstallApkRequest,
  type InstallApkResponse,
  type ListDevicesResponse,
  type OpenAdbDownloadResponse,
  type QrPairStartResponse,
  type SetDeviceSettingRequest,
  type SetDeviceSettingResponse,
  type QrPairingSession,
  type WifiResponse,
} from '../shared/ipc/device.contract';
import type { Result } from '../shared/ipc/result';

export const deviceApi = {
  listDevices: (): Promise<ListDevicesResponse> => ipcRenderer.invoke(DEVICE_CHANNELS.listDevices),

  getAdbStatus: (): Promise<AdbStatusResponse> => ipcRenderer.invoke(DEVICE_CHANNELS.adbStatus),

  chooseAdb: (): Promise<ChooseAdbResponse> => ipcRenderer.invoke(DEVICE_CHANNELS.chooseAdb),

  openAdbDownload: (): Promise<OpenAdbDownloadResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.openAdbDownload),

  disconnectDevice: (deviceId: string): Promise<WifiResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.disconnect, { deviceId } satisfies DisconnectRequest),

  /** Starts QR pairing: returns the text to draw as a QR code for the phone to scan. */
  startQrPairing: (): Promise<QrPairStartResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.qrPairStart),

  /** Resolves when the phone scanned the code and connected (or when the attempt fails). */
  waitQrPairing: (sessionId: string): Promise<WifiResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.qrPairWait, { sessionId } satisfies QrPairingSession),

  cancelQrPairing: (sessionId: string): Promise<Result<void>> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.qrPairCancel, { sessionId } satisfies QrPairingSession),

  getDeviceSettings: (deviceId: string): Promise<GetDeviceSettingsResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.getSettings, { deviceId }),

  setDeviceSetting: (
    deviceId: string,
    key: SetDeviceSettingRequest['key'],
    enabled: boolean,
  ): Promise<SetDeviceSettingResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.setSetting, {
      deviceId,
      key,
      enabled,
    } satisfies SetDeviceSettingRequest),

  /** Installs an APK on the mirrored device. Without `path`, the main process asks for the file. */
  installApk: (deviceId: string, path?: string): Promise<InstallApkResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.installApk, {
      deviceId,
      ...(path === undefined ? {} : { path }),
    } satisfies InstallApkRequest),
};
