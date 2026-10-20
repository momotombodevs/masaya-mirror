import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { err, mapResult, ok, type Result } from '../../shared/ipc/result';
import { parseDeviceId } from '../../shared/ipc/validators';
import { mt } from '../i18n';
import type { MirrorWindowService } from '../features/mirror/mirror-window.service';

/**
 * Decides whether a renderer may use a channel. On success it returns what the handler
 * needs from the (still untrusted) payload; on failure the handler never runs.
 */
export type IpcGuard<C extends object> = (event: IpcMainInvokeEvent, payload: unknown) => Result<C>;

export type IpcRequest<C extends object> = C & {
  readonly event: IpcMainInvokeEvent;
  /** The raw request payload. Handlers must validate what they read from it. */
  readonly payload: unknown;
};

/** Registers `channel`, running `handler` only for senders the guard lets through. */
export function handleIpc<T, C extends object>(
  channel: string,
  guard: IpcGuard<C>,
  handler: (request: IpcRequest<C>) => Result<T> | Promise<Result<T>>,
): void {
  ipcMain.handle(channel, async (event, payload: unknown): Promise<Result<T>> => {
    const allowed = guard(event, payload);
    if (!allowed.ok) {
      return allowed;
    }
    return handler({ ...allowed.value, event, payload });
  });
}

type Windows = Pick<MirrorWindowService, 'isMirrorWindowSender' | 'isSenderForDevice'>;

/**
 * Setup actions (choosing adb, pairing over Wi-Fi) belong to the device list. Mirror windows
 * only drive their own device, so they are turned away here as well as in the preload.
 */
export const fromMainWindow =
  (windows: Pick<Windows, 'isMirrorWindowSender'>): IpcGuard<object> =>
  (event) =>
    windows.isMirrorWindowSender(event.sender.id) ? err(mt('main.windowNotAllowed')) : ok({});

/** Capture and recording actions only make sense from the mirror window. */
export const fromMirrorWindow =
  (windows: Pick<Windows, 'isMirrorWindowSender'>): IpcGuard<object> =>
  (event) =>
    windows.isMirrorWindowSender(event.sender.id)
      ? ok({})
      : err('The requesting window cannot run QA actions.');

/**
 * For payloads naming a device: the id is validated and the sender must be the window that
 * owns that device.
 */
const fromDeviceOwner =
  (windows: Pick<Windows, 'isSenderForDevice'>): IpcGuard<Omit<DeviceRequest, 'sender'>> =>
  (event, payload) => {
    const device = parseDeviceId(payload);
    if (!device.ok) {
      return device;
    }
    if (!windows.isSenderForDevice(device.value, event.sender.id)) {
      return err('The requesting window is not allowed to control this device.');
    }
    return mapResult(device, (deviceId) => ({
      deviceId,
      body: payload as Readonly<Record<string, unknown>>,
    }));
  };

export type DeviceRequest = {
  readonly deviceId: string;
  /** The payload, already known to be an object; handlers validate the fields they read. */
  readonly body: Readonly<Record<string, unknown>>;
  readonly sender: Electron.WebContents;
};

/** `handleIpc` for the common case: a channel about one device, from the window that owns it. */
export function handleOwnedDevice<T>(
  channel: string,
  windows: Pick<Windows, 'isSenderForDevice'>,
  handler: (request: DeviceRequest) => Result<T> | Promise<Result<T>>,
): void {
  handleIpc(channel, fromDeviceOwner(windows), ({ deviceId, body, event }) =>
    handler({ deviceId, body, sender: event.sender }),
  );
}
