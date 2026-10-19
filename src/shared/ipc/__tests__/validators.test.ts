import { describe, expect, it } from 'vitest';
import { isWifiDeviceId, parseDeviceId } from '../validators';

describe('parseDeviceId', () => {
  it('accepts valid USB serial', () => {
    const result = parseDeviceId({ deviceId: 'RF8X309MHHJ' });
    expect(result).toEqual({ ok: true, value: 'RF8X309MHHJ' });
  });

  it('accepts TCP device address', () => {
    const result = parseDeviceId({ deviceId: '192.168.1.10:5555' });
    expect(result).toEqual({ ok: true, value: '192.168.1.10:5555' });
  });

  it('trims whitespace', () => {
    const result = parseDeviceId({ deviceId: '  emulator-5554  ' });
    expect(result).toEqual({ ok: true, value: 'emulator-5554' });
  });

  it('rejects empty deviceId', () => {
    const result = parseDeviceId({ deviceId: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid payload shape', () => {
    expect(parseDeviceId(null).ok).toBe(false);
    expect(parseDeviceId('RF8X309MHHJ').ok).toBe(false);
    expect(parseDeviceId({ id: 'RF8X309MHHJ' }).ok).toBe(false);
  });

  it('rejects unsafe characters', () => {
    const result = parseDeviceId({ deviceId: 'device; rm -rf /' });
    expect(result.ok).toBe(false);
  });
});

describe('isWifiDeviceId', () => {
  it('tells wireless devices from USB serials', () => {
    expect(isWifiDeviceId('192.168.1.20:5555')).toBe(true);
    expect(isWifiDeviceId('RF8X309MHHJ')).toBe(false);
    expect(isWifiDeviceId('emulator-5554')).toBe(false);
  });
});
