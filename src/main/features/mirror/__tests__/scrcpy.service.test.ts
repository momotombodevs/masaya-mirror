import type { WebContents } from 'electron';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScrcpyService } from '../scrcpy.service';
import type { AdbService } from '../../device/adb.service';
import { DEFAULT_MIRROR_OPTIONS } from '../../../../shared/mirror/types';

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

vi.mock('electron', () => ({
  MessageChannelMain: class {
    port1 = {};
    port2 = {};
  },
}));

const streamSessionClose = vi.fn();
vi.mock('../mirror-stream.session', () => ({
  MirrorStreamSession: class {
    close = streamSessionClose;
    onRendererReady = vi.fn();
  },
}));

const tango = vi.hoisted(() => ({
  createAdbServerClient: vi.fn(),
  createDeviceAdb: vi.fn(),
  pushScrcpyServer: vi.fn(),
  startScrcpyClient: vi.fn(),
}));
vi.mock('../mirror-tango.js', () => tango);

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('server')),
}));

describe('ScrcpyService', () => {
  const adbService = {
    getExecutablePath: vi.fn().mockResolvedValue('/usr/bin/adb'),
  } as unknown as AdbService;

  beforeEach(() => {
    vi.clearAllMocks();
    tango.createAdbServerClient.mockResolvedValue({});
    tango.createDeviceAdb.mockRejectedValue(new Error('no device'));
    tango.pushScrcpyServer.mockResolvedValue(undefined);
  });

  function startedClient() {
    const close = vi.fn().mockResolvedValue(undefined);
    tango.startScrcpyClient.mockResolvedValue({
      client: { close, exited: new Promise<void>(() => undefined), controller: undefined },
      metadata: { codec: 'h264', width: 1, height: 1 },
      audioCodec: null,
      audioWebCodecId: null,
      videoStream: new ReadableStream(),
      audioStream: null,
      clipboard: null,
    });
    return close;
  }

  it('starts two opens for the same device one after the other', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    tango.createDeviceAdb.mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return {};
    });
    startedClient();
    const service = new ScrcpyService(adbService);
    const webContents = {
      postMessage: vi.fn(),
      isDestroyed: () => false,
    } as unknown as WebContents;

    await Promise.all([
      service.openMirror('device1', webContents),
      service.openMirror('device1', webContents),
    ]);

    expect(tango.createDeviceAdb).toHaveBeenCalledTimes(2);
    expect(maxInFlight).toBe(1);
  });

  it('closes the client instead of storing a session when the window died during startup', async () => {
    tango.createDeviceAdb.mockResolvedValue({});
    const closeClient = startedClient();
    const service = new ScrcpyService(adbService);
    const webContents = { postMessage: vi.fn(), isDestroyed: () => true } as unknown as WebContents;

    const result = await service.openMirror('device1', webContents);

    expect(result.ok).toBe(false);
    expect(closeClient).toHaveBeenCalledTimes(1);
    expect(service.getActiveMirrors()).toEqual([]);
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
    const webContents = {
      postMessage: vi.fn(),
      isDestroyed: () => false,
    } as unknown as WebContents;
    await service.openMirror('device1', webContents);

    expect(closeSpy).toHaveBeenCalledWith('device1');
    expect(sessions.has('device1')).toBe(false);
  });

  it('setOptions closes the old session without telling the renderer it ended', async () => {
    const service = new ScrcpyService(adbService);
    const close = vi.fn();
    const sessions = new Map<string, unknown>();
    sessions.set('device1', {
      deviceId: 'device1',
      stream: { close },
      client: { close: vi.fn().mockResolvedValue(undefined) },
    });
    (service as unknown as { sessions: Map<string, unknown> }).sessions = sessions;
    const openSpy = vi
      .spyOn(service as unknown as { startMirror: () => unknown }, 'startMirror')
      .mockResolvedValue({ ok: true, value: {} as never });

    const webContents = {
      postMessage: vi.fn(),
      isDestroyed: () => false,
    } as unknown as WebContents;
    await service.setOptions('device1', webContents, { ...DEFAULT_MIRROR_OPTIONS, maxSize: 2560 });

    expect(close).toHaveBeenCalledWith(undefined, { notifyRenderer: false });
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('returns error when server jar is missing', async () => {
    const { resolveScrcpyServerPath } = await import('../scrcpy-server-path.resolver');
    vi.mocked(resolveScrcpyServerPath).mockResolvedValueOnce(null);

    const service = new ScrcpyService(adbService);
    const webContents = {
      postMessage: vi.fn(),
      isDestroyed: () => false,
    } as unknown as WebContents;
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

  describe('clipboard', () => {
    const key = (keyCode: number, metaState: number, action = 0) =>
      ({ type: 'key', action, keyCode, repeat: 0, metaState }) as const;

    function serviceWithSession() {
      const order: string[] = [];
      const pushToDevice = vi.fn(() => {
        order.push('push');
        return Promise.resolve();
      });
      const injectKeyCode = vi.fn(() => {
        order.push('key');
        return Promise.resolve();
      });
      const service = new ScrcpyService(adbService);
      (service as unknown as { sessions: Map<string, unknown> }).sessions = new Map([
        [
          'device1',
          {
            deviceId: 'device1',
            controller: { injectKeyCode },
            clipboard: { pushToDevice, stop: vi.fn() },
            controlChain: Promise.resolve(),
          },
        ],
      ]);
      return { service, order, pushToDevice };
    }

    it('sends the computer clipboard before a Ctrl+V or Cmd+V reaches the device', async () => {
      const { service, order, pushToDevice } = serviceWithSession();

      await service.sendControl('device1', key(50, 0x1000));
      await service.sendControl('device1', key(50, 0x10000));

      expect(pushToDevice).toHaveBeenCalledTimes(2);
      expect(order).toEqual(['push', 'key', 'push', 'key']);
    });

    it('leaves other keys and the key release alone', async () => {
      const { service, pushToDevice } = serviceWithSession();

      await service.sendControl('device1', key(50, 0));
      await service.sendControl('device1', key(31, 0x1000));
      await service.sendControl('device1', key(50, 0x1000, 1));

      expect(pushToDevice).not.toHaveBeenCalled();
    });

    it('syncs on demand for a window that gained focus, and ignores unknown devices', async () => {
      const { service, pushToDevice } = serviceWithSession();

      await service.syncClipboardToDevice('device1');
      await service.syncClipboardToDevice('missing');

      expect(pushToDevice).toHaveBeenCalledTimes(1);
    });
  });

  it('rotates the device when asked', async () => {
    const rotateDevice = vi.fn().mockResolvedValue(undefined);
    const service = new ScrcpyService(adbService);
    (service as unknown as { sessions: Map<string, unknown> }).sessions = new Map([
      [
        'device1',
        { deviceId: 'device1', controller: { rotateDevice }, controlChain: Promise.resolve() },
      ],
    ]);

    const result = await service.sendControl('device1', { type: 'rotate' });

    expect(result.ok).toBe(true);
    expect(rotateDevice).toHaveBeenCalledTimes(1);
  });
});
