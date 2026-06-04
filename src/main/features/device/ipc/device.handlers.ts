import { ipcMain } from 'electron';
import { DEVICE_CHANNELS, type ListDevicesResponse } from '../../../../shared/ipc/device.contract';
import type { DeviceService } from '../device.service';

export function registerDeviceIpcHandlers(deviceService: DeviceService): void {
  ipcMain.handle(
    DEVICE_CHANNELS.listDevices,
    async (): Promise<ListDevicesResponse> => deviceService.discoverDevices(),
  );
}
