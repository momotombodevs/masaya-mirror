import { ipcMain } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE_CHANNELS } from '../../../../shared/ipc/device.contract';
import { ok } from '../../../../shared/ipc/result';
import type { MirrorWindowService } from '../../mirror/mirror-window.service';
import type { AdbService } from '../adb.service';
import { registerDeviceSettingsIpcHandlers } from '../ipc/device-settings.handlers';

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));

const adbService = {
  getDeviceSettings: vi.fn(),
  setDeviceSetting: vi.fn(),
};
const mirrorWindowService = { isSenderForDevice: vi.fn() };

type Handler = (event: unknown, payload: unknown) => Promise<unknown>;

const handlerFor = (channel: string): Handler => {
  const registered = vi.mocked(ipcMain.handle).mock.calls.find(([name]) => name === channel)?.[1];
  if (!registered) {
    throw new Error(`No handler for ${channel}`);
  }
  return registered as unknown as Handler;
};

const fromWindow = { sender: { id: 7 } };

describe('registerDeviceSettingsIpcHandlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mirrorWindowService.isSenderForDevice.mockReturnValue(true);
    registerDeviceSettingsIpcHandlers(
      adbService as unknown as AdbService,
      mirrorWindowService as unknown as MirrorWindowService,
    );
  });

  it("reads the settings of the window's own device", async () => {
    adbService.getDeviceSettings.mockResolvedValue(ok({ showTouches: true, stayAwake: false }));

    const result = await handlerFor(DEVICE_CHANNELS.getSettings)(fromWindow, {
      deviceId: 'ABC123',
    });

    expect(mirrorWindowService.isSenderForDevice).toHaveBeenCalledWith('ABC123', 7);
    expect(result).toEqual({ ok: true, value: { showTouches: true, stayAwake: false } });
  });

  it('refuses a window that does not own the device', async () => {
    mirrorWindowService.isSenderForDevice.mockReturnValue(false);

    const result = await handlerFor(DEVICE_CHANNELS.setSetting)(fromWindow, {
      deviceId: 'ABC123',
      key: 'showTouches',
      enabled: true,
    });

    expect(result).toMatchObject({ ok: false });
    expect(adbService.setDeviceSetting).not.toHaveBeenCalled();
  });

  it('writes a known setting', async () => {
    adbService.setDeviceSetting.mockResolvedValue(ok(undefined));

    await handlerFor(DEVICE_CHANNELS.setSetting)(fromWindow, {
      deviceId: 'ABC123',
      key: 'stayAwake',
      enabled: true,
    });

    expect(adbService.setDeviceSetting).toHaveBeenCalledWith('ABC123', 'stayAwake', true);
  });

  it.each([
    { key: 'airplane_mode', enabled: true },
    { key: 'showTouches', enabled: 'yes' },
    { key: 'showTouches' },
  ])('rejects an unknown setting or value: %o', async (body) => {
    const result = await handlerFor(DEVICE_CHANNELS.setSetting)(fromWindow, {
      deviceId: 'ABC123',
      ...body,
    });

    expect(result).toEqual({ ok: false, error: 'Ajuste inválido.' });
    expect(adbService.setDeviceSetting).not.toHaveBeenCalled();
  });
});
