import { describe, expect, it } from 'vitest';
import { isWifiDeviceId, parseDeviceId, parsePairingCode, parseWifiAddress } from '../validators';

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

describe('parseWifiAddress', () => {
  it('accepts host:port', () => {
    expect(parseWifiAddress(' 192.168.1.20:5555 ')).toEqual({
      ok: true,
      value: '192.168.1.20:5555',
    });
    expect(parseWifiAddress('pixel.local:37099').ok).toBe(true);
  });

  it('rejects a missing or out-of-range port', () => {
    expect(parseWifiAddress('192.168.1.20').ok).toBe(false);
    expect(parseWifiAddress('192.168.1.20:0').ok).toBe(false);
    expect(parseWifiAddress('192.168.1.20:70000').ok).toBe(false);
  });

  it('rejects anything that could be read as an adb option or contains spaces', () => {
    expect(parseWifiAddress('-a:5555').ok).toBe(false);
    expect(parseWifiAddress('1.2.3.4:5555 -x').ok).toBe(false);
    expect(parseWifiAddress(5555).ok).toBe(false);
  });
});

describe('parsePairingCode', () => {
  it('accepts six digits', () => {
    expect(parsePairingCode(' 123456 ')).toEqual({ ok: true, value: '123456' });
  });

  it('rejects other shapes', () => {
    expect(parsePairingCode('12345').ok).toBe(false);
    expect(parsePairingCode('12345a').ok).toBe(false);
    expect(parsePairingCode(undefined).ok).toBe(false);
  });
});

describe('isWifiDeviceId', () => {
  it('tells wireless devices from USB serials', () => {
    expect(isWifiDeviceId('192.168.1.20:5555')).toBe(true);
    expect(isWifiDeviceId('RF8X309MHHJ')).toBe(false);
    expect(isWifiDeviceId('emulator-5554')).toBe(false);
  });
});
