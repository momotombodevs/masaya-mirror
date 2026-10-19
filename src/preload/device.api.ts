import { ipcRenderer } from 'electron';
import { DEVICE_CHANNELS, type ListDevicesResponse } from '../shared/ipc/device.contract';

export const deviceApi = {
  listDevices: (): Promise<ListDevicesResponse> => ipcRenderer.invoke(DEVICE_CHANNELS.listDevices),
};
