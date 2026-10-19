import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { DEVICE_CHANNELS } from '../../../../shared/ipc/device.contract';
import { registerDeviceIpcHandlers } from '../ipc/device.handlers';
import type { DeviceService } from '../device.service';
import { ok } from '../../../../shared/ipc/result';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

const mockedHandle = vi.mocked(ipcMain.handle);

describe('registerDeviceIpcHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers listDevices channel', () => {
    const deviceService = {
      discoverDevices: vi.fn(),
    } as unknown as DeviceService;

    registerDeviceIpcHandlers(deviceService);

    expect(mockedHandle).toHaveBeenCalledWith(DEVICE_CHANNELS.listDevices, expect.any(Function));
  });

  it('handler returns discoverDevices result', async () => {
    const devices = [{ id: 'device-1', status: 'device' as const }];
    const deviceService = {
      discoverDevices: vi.fn().mockResolvedValue(ok(devices)),
    } as unknown as DeviceService;

    registerDeviceIpcHandlers(deviceService);

    const handler = mockedHandle.mock.calls[0]?.[1];
    expect(handler).toBeDefined();

    const result = await handler?.({} as Electron.IpcMainInvokeEvent);
    expect(result).toEqual({ ok: true, value: devices });
    expect(deviceService.discoverDevices).toHaveBeenCalledOnce();
  });
});
