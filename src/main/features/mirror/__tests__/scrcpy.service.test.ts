import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrcpyService } from '../scrcpy.service';
import type { AdbService } from '../../device/adb.service';

vi.mock('@yume-chan/adb', () => ({
  AdbServerClient: vi.fn(),
}));

vi.mock('@yume-chan/adb-server-node-tcp', () => ({
  AdbServerNodeTcpConnector: vi.fn(),
}));

vi.mock('@yume-chan/adb-scrcpy', () => ({
  AdbScrcpyClient: {
    pushServer: vi.fn().mockResolvedValue(undefined),
    start: vi.fn(),
  },
  AdbScrcpyOptionsLatest: vi.fn().mockImplementation((init: unknown) => ({ value: init })),
}));

vi.mock('../../../utils/runCommand', () => ({
  runCommand: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}));

vi.mock('../scrcpy-server-path.resolver', () => ({
  resolveScrcpyServerPath: vi.fn().mockResolvedValue('/tmp/scrcpy-server.jar'),
  getExpectedScrcpyServerPath: vi.fn().mockReturnValue('/tmp/scrcpy-server.jar'),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('server')),
}));

describe('ScrcpyService', () => {
  const adbService = {
    getExecutablePath: vi.fn().mockResolvedValue('/usr/bin/adb'),
  } as unknown as AdbService;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns active mirrors from session map', () => {
    const service = new ScrcpyService(adbService);
    expect(service.getActiveMirrors()).toEqual([]);
  });

  it('closes existing session before opening a new mirror', async () => {
    const service = new ScrcpyService(adbService);
    const sessions = new Map<string, unknown>();
    sessions.set('device1', {
      deviceId: 'device1',
      stream: { close: vi.fn() },
      client: { close: vi.fn().mockResolvedValue(undefined) },
    });
    (service as unknown as { sessions: Map<string, unknown> }).sessions = sessions;

    const closeSpy = vi.spyOn(service, 'closeMirror');
    const webContents = { postMessage: vi.fn() } as unknown as import('electron').WebContents;
    await service.openMirror('device1', webContents);

    expect(closeSpy).toHaveBeenCalledWith('device1');
    expect(sessions.has('device1')).toBe(false);
  });

  it('returns error when server jar is missing', async () => {
    const { resolveScrcpyServerPath } = await import('../scrcpy-server-path.resolver');
    vi.mocked(resolveScrcpyServerPath).mockResolvedValueOnce(null);

    const service = new ScrcpyService(adbService);
    const webContents = { postMessage: vi.fn() } as unknown as import('electron').WebContents;
    const result = await service.openMirror('device1', webContents);
    expect(result.ok).toBe(false);
  });

  it('notifyStreamReady calls onRendererReady each time', () => {
    const service = new ScrcpyService(adbService);
    const onRendererReady = vi.fn();
    const sessions = new Map<string, unknown>();
    sessions.set('device1', {
      deviceId: 'device1',
      stream: { onRendererReady },
      client: { close: vi.fn().mockResolvedValue(undefined) },
      controller: undefined,
      options: {},
      audioEnabled: false,
    });
    (service as unknown as { sessions: Map<string, unknown> }).sessions = sessions;

    const first = service.notifyStreamReady('device1');
    const second = service.notifyStreamReady('device1');

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(onRendererReady).toHaveBeenCalledTimes(2);
  });

  it('closeMirror succeeds when no session', async () => {
    const service = new ScrcpyService(adbService);
    const result = await service.closeMirror('unknown');
    expect(result.ok).toBe(true);
  });
});
