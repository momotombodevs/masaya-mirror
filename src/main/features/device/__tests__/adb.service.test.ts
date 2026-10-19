import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdbService, parseAdbDevicesOutput } from '../adb.service';
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
