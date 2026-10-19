import { deviceApi } from './device.api';
import { menuApi } from './menu.api';
import { mirrorApi } from './mirror.api';
import { qaApi } from './qa.api';

export const manoloApi = {
  ...deviceApi,
  ...mirrorApi,
  ...qaApi,
  ...menuApi,
};

export type ManoloApi = typeof manoloApi;

type ApiName = keyof ManoloApi;

/** Calls every window may make. The rest is only exposed to the window that needs it. */
const COMMON_API: readonly ApiName[] = ['getMirrorStatus', 'onMenuAction'];

const MAIN_WINDOW_API: readonly ApiName[] = [...COMMON_API, 'listDevices', 'openMirrorWindow'];

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
];

const unavailable = (): Promise<{ ok: false; error: string }> =>
  Promise.resolve({ ok: false, error: 'API no disponible en esta ventana.' });

/** Keeps the full API shape but replaces calls outside `allowed` with a failing stub. */
function exposeOnly(allowed: readonly ApiName[]): ManoloApi {
  const entries = Object.entries(manoloApi).map(([name, call]) => [
    name,
    allowed.includes(name as ApiName) ? call : unavailable,
  ]);
  return Object.fromEntries(entries) as ManoloApi;
}

export const createMainWindowApi = (): ManoloApi => exposeOnly(MAIN_WINDOW_API);

export const createMirrorWindowApi = (): ManoloApi => exposeOnly(MIRROR_WINDOW_API);
