import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { DEVICE_CHANNELS } from '../../../../shared/ipc/device.contract';
import { registerDeviceIpcHandlers } from '../ipc/device.handlers';
import type { AdbService } from '../adb.service';
import { err, ok } from '../../../../shared/ipc/result';

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
    const adbService = { listDevices: vi.fn() } as unknown as AdbService;

    registerDeviceIpcHandlers(adbService);

    expect(mockedHandle).toHaveBeenCalledWith(DEVICE_CHANNELS.listDevices, expect.any(Function));
  });

  it('handler returns the listDevices result', async () => {
    const devices = [{ id: 'device-1', status: 'device' as const }];
    const adbService = {
      listDevices: vi.fn().mockResolvedValue(ok(devices)),
    } as unknown as AdbService;

    registerDeviceIpcHandlers(adbService);

    const handler = mockedHandle.mock.calls[0]?.[1];
    expect(handler).toBeDefined();

    const result = await handler?.({} as Electron.IpcMainInvokeEvent);
    expect(result).toEqual({ ok: true, value: devices });
    expect(adbService.listDevices).toHaveBeenCalledOnce();
  });

  it('passes adb failures through', async () => {
    const adbService = {
      listDevices: vi.fn().mockResolvedValue(err('ADB no encontrado')),
    } as unknown as AdbService;
    registerDeviceIpcHandlers(adbService);

    const handler = mockedHandle.mock.calls[0]?.[1];

    expect(await handler?.({} as Electron.IpcMainInvokeEvent)).toEqual({
      ok: false,
      error: 'ADB no encontrado',
    });
  });
});
