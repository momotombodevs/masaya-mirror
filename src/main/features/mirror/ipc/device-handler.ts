import { ipcMain } from 'electron';
import { err, type Result } from '../../../../shared/ipc/result';
import { parseDeviceId } from '../../../../shared/ipc/validators';
import type { MirrorWindowService } from '../mirror-window.service';

export type DeviceRequest = {
  readonly deviceId: string;
  /** The raw, still untrusted request payload; handlers must validate what they read from it. */
  readonly body: Readonly<Record<string, unknown>>;
  readonly sender: Electron.WebContents;
};

export type DeviceHandler<T> = (request: DeviceRequest) => Result<T> | Promise<Result<T>>;

/**
 * Registers a channel whose payload names a device. The device id is validated and the
 * sender must be the window that owns that device before `handler` runs.
 */
export function handleOwnedDevice<T>(
  channel: string,
  windows: MirrorWindowService,
  handler: DeviceHandler<T>,
): void {
  ipcMain.handle(channel, async (event, payload: unknown): Promise<Result<T>> => {
    const device = parseDeviceId(payload);
    if (!device.ok) {
      return device;
    }
    if (!windows.isSenderForDevice(device.value, event.sender.id)) {
      return err('The requesting window is not allowed to control this device.');
    }
    return handler({
      deviceId: device.value,
      body: payload as Record<string, unknown>,
      sender: event.sender,
    });
  });
}
