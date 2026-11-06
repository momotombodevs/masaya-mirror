import { Channel, invoke } from '@tauri-apps/api/core';
import type { LanguagePreference } from '../../../../shared/i18n/locale';
import { err, ok, type Result } from '../../../../shared/ipc/result';
import type { OpenMirrorSuccess } from '../../../../shared/ipc/mirror.contract';
import type { MenuAction } from '../../../../shared/ipc/menu.contract';
import type { MasayaApi } from '../masaya-api';
import { deliverMirrorPort } from '../../features/mirror/mirror-port-delivery';
import { readPreferences, parsePreferencesPatch } from '../../../../shared/preferences/parse';
import type { Preferences } from '../../../../shared/preferences/types';
import { decodeStreamFrame } from './stream-frame';

/** Said by the calls the Rust shell does not do yet. */
export const NOT_YET_IN_TAURI = 'Esta función aún no está disponible en la versión Tauri.';

const PREFERENCES_KEY = 'masaya.preferences';

/** True inside a Tauri window. */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Commands answer with a Result, but the call itself can still fail (unknown command, the shell
 * is gone). That becomes a Result too, so callers only ever branch on `ok`.
 */
async function command<T>(name: string, args?: Record<string, unknown>): Promise<Result<T>> {
  try {
    return await invoke<Result<T>>(name, args);
  } catch (error) {
    return err(error instanceof Error ? error.message : String(error));
  }
}

const unsupported = (): Promise<Result<never>> => Promise.resolve(err(NOT_YET_IN_TAURI));

/**
 * A `MessagePort` the stream components already know how to read, fed from a Tauri channel. The
 * frames are decoded here so the rest of the renderer sees the same messages as with Electron.
 */
function openStreamPort(): { channel: Channel<ArrayBuffer | number[]>; port: MessagePort } {
  const { port1, port2 } = new MessageChannel();
  const channel = new Channel<ArrayBuffer | number[]>();
  channel.onmessage = (data): void => {
    const buffer = data instanceof ArrayBuffer ? data : new Uint8Array(data).buffer;
    const message = decodeStreamFrame(buffer);
    if (!message) {
      return;
    }
    // The buffer is ours alone, so the packet's bytes move instead of being copied.
    port2.postMessage(message, message.kind === 'packet' ? [buffer] : []);
  };
  return { channel, port: port1 };
}

async function startMirror(
  name: 'open_mirror' | 'set_mirror_options',
  deviceId: string,
  options: unknown,
): Promise<Result<OpenMirrorSuccess>> {
  const { channel, port } = openStreamPort();
  const result = await command<OpenMirrorSuccess>(name, { deviceId, options, onStream: channel });
  if (result.ok) {
    deliverMirrorPort(deviceId, port);
  } else {
    port.close();
  }
  return result;
}

function loadPreferences(): Preferences {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    return readPreferences(raw ? (JSON.parse(raw) as unknown) : undefined);
  } catch {
    return readPreferences(undefined);
  }
}

/**
 * The same surface the Electron preload exposes, over Tauri commands. What the shell has not
 * ported yet answers `NOT_YET_IN_TAURI`; preferences live in this webview's local storage until
 * the shell stores them.
 */
export function createTauriApi(): MasayaApi {
  return {
    listDevices: () => command('list_devices'),
    getAdbStatus: () => command('get_adb_status'),
    chooseAdb: () => command('choose_adb'),
    openAdbDownload: () => command('open_adb_download'),
    disconnectDevice: (deviceId) => command('disconnect_device', { deviceId }),
    startQrPairing: unsupported,
    waitQrPairing: unsupported,
    cancelQrPairing: unsupported,
    getDeviceSettings: (deviceId) => command('get_device_settings', { deviceId }),
    setDeviceSetting: (deviceId, key, enabled) =>
      command('set_device_setting', { deviceId, key, enabled }),
    installApk: (deviceId, path) => command('install_apk', { deviceId, path }),

    openMirrorWindow: (deviceId, deviceLabel) =>
      command('open_mirror_window', { deviceId, deviceLabel }),
    openMirror: (deviceId, options) => startMirror('open_mirror', deviceId, options),
    closeMirror: (deviceId) => command('close_mirror', { deviceId }),
    getMirrorStatus: () => command('get_mirror_status'),
    sendControl: (deviceId, message) => command('send_control', { deviceId, message }),
    setMirrorOptions: (deviceId, options) => startMirror('set_mirror_options', deviceId, options),
    notifyMirrorStreamReady: (deviceId) => command('notify_mirror_stream_ready', { deviceId }),
    setMirrorVideoLayout: (deviceId, videoWidth, videoHeight) =>
      command('set_mirror_video_layout', { deviceId, videoWidth, videoHeight }),
    setAlwaysOnTop: (deviceId, enabled) => command('set_always_on_top', { deviceId, enabled }),

    copyCapture: unsupported,
    saveCapture: unsupported,
    saveRecording: unsupported,

    getPreferences: () => Promise.resolve(ok(loadPreferences())),
    setPreferences: (patch) => {
      const parsed = parsePreferencesPatch(patch);
      if (!parsed.ok) {
        return Promise.resolve(parsed);
      }
      const next = { ...loadPreferences(), ...parsed.value };
      try {
        window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(next));
      } catch {
        // Not persisted (private mode, blocked storage): the change still applies to this session.
      }
      return Promise.resolve(ok(next));
    },
    // Other windows of the app share this storage, so its event carries a language change.
    onLanguageChange: (listener: (language: LanguagePreference) => void) => {
      const handler = (event: StorageEvent): void => {
        if (event.key === PREFERENCES_KEY) {
          listener(loadPreferences().language);
        }
      };
      window.addEventListener('storage', handler);
      return () => window.removeEventListener('storage', handler);
    },
    onMenuAction: (_listener: (action: MenuAction) => void) => () => undefined,

    // Dropped files carry no path in a webview; Tauri reports them through its drag-drop event.
    getPathForFile: () => '',
    copyDiagnosticReport: unsupported,
    openLogFolder: unsupported,
  };
}
