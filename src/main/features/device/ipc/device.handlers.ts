import { ipcMain } from 'electron';
import { DEVICE_CHANNELS, type ListDevicesResponse } from '../../../../shared/ipc/device.contract';
import type { AdbService } from '../adb.service';

export function registerDeviceIpcHandlers(adbService: AdbService): void {
  ipcMain.handle(DEVICE_CHANNELS.listDevices, async (): Promise<ListDevicesResponse> =>
    adbService.listDevices(),
  );
}
