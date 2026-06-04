import { describe, expect, it, vi } from 'vitest';
import { DeviceService } from '../device.service';
import type { AdbService } from '../adb.service';
import { ok, err } from '../../../../shared/ipc/result';

describe('DeviceService', () => {
  it('returns devices from adb service', async () => {
    const devices = [{ id: 'emulator-5554', status: 'device' as const }];
    const adbService = {
      listDevices: vi.fn().mockResolvedValue(ok(devices)),
    } as unknown as AdbService;

    const service = new DeviceService(adbService);
    const result = await service.discoverDevices();

    expect(adbService.listDevices).toHaveBeenCalledOnce();
    expect(result).toEqual({ ok: true, value: devices });
  });

  it('propagates adb service errors', async () => {
    const adbService = {
      listDevices: vi.fn().mockResolvedValue(err('ADB no encontrado')),
    } as unknown as AdbService;

    const service = new DeviceService(adbService);
    const result = await service.discoverDevices();

    expect(result).toEqual({ ok: false, error: 'ADB no encontrado' });
  });
});
