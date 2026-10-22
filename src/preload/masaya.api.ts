import { deviceApi } from './device.api';
import { diagnosticsApi } from './diagnostics.api';
import { filesApi } from './files.api';
import { menuApi } from './menu.api';
import { mirrorApi } from './mirror.api';
import { preferencesApi } from './preferences.api';
import { qaApi } from './qa.api';

const masayaApi = {
  ...deviceApi,
  ...mirrorApi,
  ...qaApi,
  ...preferencesApi,
  ...filesApi,
  ...menuApi,
  ...diagnosticsApi,
};

export type MasayaApi = typeof masayaApi;

type ApiName = keyof MasayaApi;

/** Calls every window may make. The rest is only exposed to the window that needs it. */
const COMMON_API: readonly ApiName[] = [
  'getMirrorStatus',
  'onMenuAction',
  'getPreferences',
  'onLanguageChange',
];

const MAIN_WINDOW_API: readonly ApiName[] = [
  ...COMMON_API,
  'listDevices',
  'openMirrorWindow',
  'getAdbStatus',
  'chooseAdb',
  'openAdbDownload',
  'disconnectDevice',
  'startQrPairing',
  'waitQrPairing',
  'cancelQrPairing',
];

const MIRROR_WINDOW_API: readonly ApiName[] = [
  ...COMMON_API,
  'openMirror',
  'closeMirror',
  'sendControl',
  'setMirrorOptions',
  'notifyMirrorStreamReady',
  'setMirrorVideoLayout',
  'copyCapture',
  'saveCapture',
  'saveRecording',
  'installApk',
  'getDeviceSettings',
  'setDeviceSetting',
  'setAlwaysOnTop',
  'getPathForFile',
  'setPreferences',
  'copyDiagnosticReport',
  'openLogFolder',
];

const unavailable = (): Promise<{ ok: false; error: string }> =>
  Promise.resolve({ ok: false, error: 'API no disponible en esta ventana.' });

/** Keeps the full API shape but replaces calls outside `allowed` with a failing stub. */
function exposeOnly(allowed: readonly ApiName[]): MasayaApi {
  const entries = Object.entries(masayaApi).map(([name, call]) => [
    name,
    allowed.includes(name as ApiName) ? call : unavailable,
  ]);
  return Object.fromEntries(entries) as MasayaApi;
}

export const createMainWindowApi = (): MasayaApi => exposeOnly(MAIN_WINDOW_API);

export const createMirrorWindowApi = (): MasayaApi => exposeOnly(MIRROR_WINDOW_API);
