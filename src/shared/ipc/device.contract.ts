import type { AndroidDevice } from '../device/types';
import type { Result } from './result';

export const DEVICE_CHANNELS = {
  listDevices: 'device:list-devices',
  adbStatus: 'device:adb-status',
  chooseAdb: 'device:choose-adb',
  openAdbDownload: 'device:open-adb-download',
  pairWifi: 'device:pair-wifi',
  connectWifi: 'device:connect-wifi',
  disconnect: 'device:disconnect',
  installApk: 'device:install-apk',
} as const;

export type ListDevicesResponse = Result<readonly AndroidDevice[]>;

export type AdbStatusResponse = Result<{ readonly path: string | null }>;

/** `path` is null when the user closed the file picker without choosing. */
export type ChooseAdbResponse = Result<{ readonly path: string | null }>;

export type OpenAdbDownloadResponse = Result<void>;

export type PairWifiRequest = { readonly address: string; readonly code: string };
export type ConnectWifiRequest = { readonly address: string };
export type DisconnectRequest = { readonly deviceId: string };

/** Human-readable outcome from adb, e.g. "connected to 192.168.1.5:5555". */
export type WifiResponse = Result<{ readonly message: string }>;

export type InstallApkRequest = {
  readonly deviceId: string;
  /** Absolute path of a dropped file. When omitted, the main process shows a file picker. */
  readonly path?: string;
};

/** `installed` is false when the user cancelled the file picker. */
export type InstallApkResponse = Result<{ readonly installed: boolean }>;
