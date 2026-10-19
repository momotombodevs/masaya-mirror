import { ipcRenderer } from 'electron';
import {
  DEVICE_CHANNELS,
  type AdbStatusResponse,
  type ChooseAdbResponse,
  type ConnectWifiRequest,
  type DisconnectRequest,
  type InstallApkRequest,
  type InstallApkResponse,
  type ListDevicesResponse,
  type OpenAdbDownloadResponse,
  type PairWifiRequest,
  type WifiResponse,
} from '../shared/ipc/device.contract';

export const deviceApi = {
  listDevices: (): Promise<ListDevicesResponse> => ipcRenderer.invoke(DEVICE_CHANNELS.listDevices),

  getAdbStatus: (): Promise<AdbStatusResponse> => ipcRenderer.invoke(DEVICE_CHANNELS.adbStatus),

  chooseAdb: (): Promise<ChooseAdbResponse> => ipcRenderer.invoke(DEVICE_CHANNELS.chooseAdb),

  openAdbDownload: (): Promise<OpenAdbDownloadResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.openAdbDownload),

  pairWifi: (address: string, code: string): Promise<WifiResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.pairWifi, { address, code } satisfies PairWifiRequest),

  connectWifi: (address: string): Promise<WifiResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.connectWifi, { address } satisfies ConnectWifiRequest),

  disconnectDevice: (deviceId: string): Promise<WifiResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.disconnect, { deviceId } satisfies DisconnectRequest),

  /** Installs an APK on the mirrored device. Without `path`, the main process asks for the file. */
  installApk: (deviceId: string, path?: string): Promise<InstallApkResponse> =>
    ipcRenderer.invoke(DEVICE_CHANNELS.installApk, {
      deviceId,
      ...(path === undefined ? {} : { path }),
    } satisfies InstallApkRequest),
};
