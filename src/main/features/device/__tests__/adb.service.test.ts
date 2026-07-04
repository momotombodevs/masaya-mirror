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
      expect(result.error).toContain('ADB not found');
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
