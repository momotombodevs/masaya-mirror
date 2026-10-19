import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdbService, parseAdbDevicesOutput, parseMdnsServices } from '../adb.service';
import { CommandError, runCommand } from '../../../utils/runCommand';

vi.mock('../../../utils/runCommand', () => ({
  runCommand: vi.fn(),
  CommandError: class CommandError extends Error {
    code?: string;
    timedOut: boolean;
    constructor(message: string, options: { code?: string; timedOut?: boolean } = {}) {
      super(message);
      this.code = options.code;
      this.timedOut = options.timedOut ?? false;
    }
  },
}));

vi.mock('../adb-path.resolver', () => ({
  resolveAdbPath: vi.fn().mockResolvedValue('/usr/local/bin/adb'),
}));

const mockedRunCommand = vi.mocked(runCommand);

describe('parseAdbDevicesOutput', () => {
  it('parses connected device with model and product', () => {
    const stdout = `List of devices attached
emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:1`;

    const devices = parseAdbDevicesOutput(stdout);

    expect(devices).toHaveLength(1);
    expect(devices[0]).toEqual({
      id: 'emulator-5554',
      status: 'device',
      model: 'sdk_gphone64_arm64',
      product: 'sdk_gphone64_arm64',
    });
  });

  it('parses unauthorized and offline devices', () => {
    const stdout = `List of devices attached
ABC123          unauthorized
XYZ789          offline`;

    const devices = parseAdbDevicesOutput(stdout);

    expect(devices).toHaveLength(2);
    expect(devices[0]).toEqual({ id: 'ABC123', status: 'unauthorized' });
    expect(devices[1]).toEqual({ id: 'XYZ789', status: 'offline' });
  });

  it('returns empty list when no devices', () => {
    const stdout = 'List of devices attached\n';

    expect(parseAdbDevicesOutput(stdout)).toEqual([]);
  });

  it('skips malformed lines', () => {
    const stdout = `List of devices attached
broken-line
emulator-5554          device`;

    const devices = parseAdbDevicesOutput(stdout);

    expect(devices).toHaveLength(1);
    expect(devices[0]?.id).toBe('emulator-5554');
  });
});

describe('AdbService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed devices on success', async () => {
    mockedRunCommand.mockResolvedValue({
      stdout: 'List of devices attached\nemulator-5554          device',
      stderr: '',
    });

    const service = new AdbService();
    const result = await service.listDevices();

    expect(mockedRunCommand).toHaveBeenCalledWith('/usr/local/bin/adb', ['devices', '-l']);
    expect(result).toEqual({
      ok: true,
      value: [{ id: 'emulator-5554', status: 'device' }],
    });
  });

  it('returns error when adb executable cannot be resolved', async () => {
    const { resolveAdbPath } = await import('../adb-path.resolver');
    vi.mocked(resolveAdbPath).mockResolvedValueOnce(null);

    const service = new AdbService();
    const result = await service.listDevices();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('ADB no encontrado');
    }
    expect(mockedRunCommand).not.toHaveBeenCalled();
  });

  it('returns stderr message on adb failure', async () => {
    mockedRunCommand.mockRejectedValue(
      new CommandError('adb: server version mismatch', { stderr: 'adb: server version mismatch' }),
    );

    const service = new AdbService();
    const result = await service.listDevices();

    expect(result).toEqual({ ok: false, error: 'adb: server version mismatch' });
  });
});

describe('AdbService wireless and install commands', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const reply = (stdout: string): void => {
    mockedRunCommand.mockResolvedValue({ stdout, stderr: '' });
  };

  it('pairs with address and code', async () => {
    reply('Successfully paired to 192.168.1.20:37099 [guid=adb-ABC]');

    const result = await new AdbService().pair('192.168.1.20:37099', '123456');

    expect(mockedRunCommand).toHaveBeenCalledWith(
      '/usr/local/bin/adb',
      ['pair', '192.168.1.20:37099', '123456'],
      20_000,
    );
    expect(result).toEqual({ ok: true, value: 'Dispositivo vinculado.' });
  });

  it('reports adb failure text when pairing is rejected', async () => {
    reply('Failed: Wrong password or connection was dropped.');

    const result = await new AdbService().pair('192.168.1.20:37099', '000000');

    expect(result).toEqual({
      ok: false,
      error: 'Failed: Wrong password or connection was dropped.',
    });
  });

  it('treats "connected" and "already connected" as success', async () => {
    reply('connected to 192.168.1.20:5555');
    expect((await new AdbService().connect('192.168.1.20:5555')).ok).toBe(true);

    reply('already connected to 192.168.1.20:5555');
    expect((await new AdbService().connect('192.168.1.20:5555')).ok).toBe(true);
  });

  it('treats adb exit-code-0 failures as errors', async () => {
    reply('failed to connect to 192.168.1.20:5555');

    const result = await new AdbService().connect('192.168.1.20:5555');

    expect(result).toEqual({ ok: false, error: 'failed to connect to 192.168.1.20:5555' });
  });

  it('disconnects by address', async () => {
    reply('disconnected 192.168.1.20:5555');

    const result = await new AdbService().disconnect('192.168.1.20:5555');

    expect(mockedRunCommand).toHaveBeenCalledWith(
      '/usr/local/bin/adb',
      ['disconnect', '192.168.1.20:5555'],
      20_000,
    );
    expect(result.ok).toBe(true);
  });

  it('installs an APK on one device and detects success', async () => {
    reply('Performing Streamed Install\nSuccess');

    const result = await new AdbService().installApk('emulator-5554', '/tmp/app.apk');

    expect(mockedRunCommand).toHaveBeenCalledWith(
      '/usr/local/bin/adb',
      ['-s', 'emulator-5554', 'install', '-r', '-t', '/tmp/app.apk'],
      180_000,
    );
    expect(result).toEqual({ ok: true, value: undefined });
  });

  it('surfaces the install failure reason', async () => {
    reply(
      'Performing Streamed Install\nadb: failed to install /tmp/app.apk: Failure [INSTALL_FAILED_OLDER_SDK]',
    );

    const result = await new AdbService().installApk('emulator-5554', '/tmp/app.apk');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('INSTALL_FAILED_OLDER_SDK');
    }
  });

  it('verifies that a candidate is really adb', async () => {
    reply('Android Debug Bridge version 1.0.41');
    expect(await new AdbService().verifyExecutable('/opt/adb')).toBe(true);

    reply('GNU bash, version 5.2');
    expect(await new AdbService().verifyExecutable('/bin/bash')).toBe(false);

    mockedRunCommand.mockRejectedValue(new Error('spawn ENOENT'));
    expect(await new AdbService().verifyExecutable('/nope')).toBe(false);
  });

  it('prefers the custom adb path and forgets the cached one when it changes', async () => {
    const { resolveAdbPath } = await import('../adb-path.resolver');
    const service = new AdbService();

    service.setCustomPath('/custom/adb');
    await service.getExecutablePath();
    expect(resolveAdbPath).toHaveBeenLastCalledWith('/custom/adb');

    service.setCustomPath(null);
    await service.getExecutablePath();
    expect(resolveAdbPath).toHaveBeenLastCalledWith(null);
  });
});

describe('parseMdnsServices', () => {
  it('reads pairing and connect services from adb mdns output', () => {
    const stdout = [
      'List of discovered mdns services',
      'manolo-a1b2c3\t_adb-tls-pairing._tcp\t192.168.1.23:41921',
      'adb-R5CT123456-abcdef\t_adb-tls-connect._tcp\t192.168.1.23:38711',
    ].join('\n');

    expect(parseMdnsServices(stdout)).toEqual([
      { name: 'manolo-a1b2c3', kind: 'pairing', address: '192.168.1.23:41921' },
      { name: 'adb-R5CT123456-abcdef', kind: 'connect', address: '192.168.1.23:38711' },
    ]);
  });

  it('skips headers, other service types and IPv6 addresses', () => {
    const stdout = [
      'List of discovered mdns services',
      'printer\t_ipp._tcp\t192.168.1.50:631',
      'phone\t_adb-tls-connect._tcp\t[fe80::1]:5555',
      'garbage line',
    ].join('\n');

    expect(parseMdnsServices(stdout)).toEqual([]);
  });
});

describe('AdbService mDNS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts a working mdns daemon', async () => {
    mockedRunCommand.mockResolvedValue({
      stdout: 'mdns daemon version [Openscreen discovery 0.0.0]',
      stderr: '',
    });

    expect((await new AdbService().checkMdns()).ok).toBe(true);
  });

  it('reports when mdns is unavailable', async () => {
    mockedRunCommand.mockResolvedValue({
      stdout: 'ERROR: mdns discovery unavailable',
      stderr: '',
    });

    const result = await new AdbService().checkMdns();

    expect(result.ok).toBe(false);
  });
});

describe('AdbService device settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const answer = (touches: string, stayAwake: string): void => {
    mockedRunCommand.mockImplementation(async (_adb, args) => ({
      stdout: args.includes('show_touches') ? touches : stayAwake,
      stderr: '',
    }));
  };

  it('reads show touches and stay awake from the phone', async () => {
    answer('1\n', '7\n');

    const result = await new AdbService().getDeviceSettings('emulator-5554');

    expect(result).toEqual({ ok: true, value: { showTouches: true, stayAwake: true } });
    expect(mockedRunCommand).toHaveBeenCalledWith(
      '/usr/local/bin/adb',
      ['-s', 'emulator-5554', 'shell', 'settings', 'get', 'system', 'show_touches'],
      20_000,
    );
  });

  it('treats 0 and null as off', async () => {
    answer('0\n', 'null\n');

    expect(await new AdbService().getDeviceSettings('emulator-5554')).toEqual({
      ok: true,
      value: { showTouches: false, stayAwake: false },
    });
  });

  it('passes through the adb error when the phone cannot be read', async () => {
    mockedRunCommand.mockRejectedValue(
      new CommandError('error: device offline', { stderr: 'error: device offline' }),
    );

    expect(await new AdbService().getDeviceSettings('emulator-5554')).toEqual({
      ok: false,
      error: 'error: device offline',
    });
  });

  it.each([
    ['showTouches', true, ['system', 'show_touches', '1']],
    ['showTouches', false, ['system', 'show_touches', '0']],
    ['stayAwake', true, ['global', 'stay_on_while_plugged_in', '7']],
    ['stayAwake', false, ['global', 'stay_on_while_plugged_in', '0']],
  ] as const)('writes %s=%s with the right adb arguments', async (key, enabled, tail) => {
    mockedRunCommand.mockResolvedValue({ stdout: '', stderr: '' });

    const result = await new AdbService().setDeviceSetting('emulator-5554', key, enabled);

    expect(result.ok).toBe(true);
    expect(mockedRunCommand).toHaveBeenCalledWith(
      '/usr/local/bin/adb',
      ['-s', 'emulator-5554', 'shell', 'settings', 'put', ...tail],
      20_000,
    );
  });
});
