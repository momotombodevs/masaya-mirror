import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MirrorWindowService } from '../mirror-window.service';
import { createSecureWindow } from '../../../secure-window';
import type { ScrcpyService } from '../scrcpy.service';

class FakeWindow extends EventEmitter {
  static instances: FakeWindow[] = [];
  destroyed = false;
  readonly webContents = { id: FakeWindow.instances.length + 100 };
  readonly setContentSize = vi.fn();
  readonly setMinimumSize = vi.fn();
  readonly setAspectRatio = vi.fn();
  loadURL = vi.fn().mockResolvedValue(undefined);
  constructor() {
    super();
    FakeWindow.instances.push(this);
  }
  isDestroyed = () => this.destroyed;
  isFullScreen = () => false;
  isMaximized = () => false;
  getBounds = () => ({ x: 0, y: 0, width: 400, height: 860 });
  getContentSize = () => [400, 800];
  close = vi.fn(() => {
    this.destroyed = true;
    this.emit('closed');
  });
}

vi.mock('electron', () => ({
  screen: { getDisplayMatching: () => ({ workAreaSize: { width: 1920, height: 1080 } }) },
}));
vi.mock('../../../secure-window', () => ({
  createSecureWindow: vi.fn(() => new FakeWindow()),
}));
vi.mock('../../../paths', () => ({
  RENDERER_DIST: '/app/dist',
  VITE_DEV_SERVER_URL: undefined,
}));

describe('MirrorWindowService', () => {
  const scrcpyService = {
    closeMirror: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
    syncClipboardToDevice: vi.fn().mockResolvedValue(undefined),
  };
  let service: MirrorWindowService;

  beforeEach(() => {
    vi.clearAllMocks();
    FakeWindow.instances = [];
    service = new MirrorWindowService({ scrcpyService: scrcpyService as unknown as ScrcpyService });
  });

  const internals = () =>
    service as unknown as {
      layoutApplied: Set<string>;
      orientations: Map<string, string>;
      windows: Map<string, FakeWindow>;
    };

  it('opens a window through the secure window factory and registers it', async () => {
    await service.open('device1', 'Pixel');

    expect(createSecureWindow).toHaveBeenCalledTimes(1);
    expect(service.getOpenDeviceIds()).toEqual(['device1']);
    const [win] = FakeWindow.instances;
    expect(service.isSenderForDevice('device1', win!.webContents.id)).toBe(true);
    expect(service.isMirrorWindowSender(win!.webContents.id)).toBe(true);
  });

  it('forgets everything about a device when its window closes', async () => {
    await service.open('device1', 'Pixel');
    service.setVideoLayout('device1', 1080, 1920);
    expect(internals().layoutApplied.has('device1')).toBe(true);
    expect(internals().orientations.has('device1')).toBe(true);

    FakeWindow.instances[0]?.emit('closed');

    expect(service.getOpenDeviceIds()).toEqual([]);
    expect(internals().layoutApplied.size).toBe(0);
    expect(internals().orientations.size).toBe(0);
    expect(scrcpyService.closeMirror).toHaveBeenCalledWith('device1');
  });

  it('starts a re-opened window from scratch so its layout is applied again', async () => {
    await service.open('device1', 'Pixel');
    service.setVideoLayout('device1', 1080, 1920);

    await service.open('device1', 'Pixel');
    const [, second] = FakeWindow.instances;
    expect(internals().layoutApplied.has('device1')).toBe(false);
    expect(internals().orientations.has('device1')).toBe(false);

    service.setVideoLayout('device1', 1080, 1920);
    expect(second?.setContentSize).toHaveBeenCalledTimes(1);
  });

  it('keeps the replacement registered when the replaced window finishes closing', async () => {
    await service.open('device1', 'Pixel');
    const [first] = FakeWindow.instances;
    await service.open('device1', 'Pixel');
    const [, second] = FakeWindow.instances;

    first?.emit('closed');

    expect(first?.close).toHaveBeenCalled();
    expect(internals().windows.get('device1')).toBe(second);
  });

  it('serializes opens of the same device so only one window survives', async () => {
    let release: () => void = () => undefined;
    scrcpyService.closeMirror.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, value: undefined });
        }),
    );

    const first = service.open('device1', 'Pixel');
    const second = service.open('device1', 'Pixel');
    await Promise.resolve();
    expect(createSecureWindow).not.toHaveBeenCalled();

    release();
    await Promise.all([first, second]);

    expect(createSecureWindow).toHaveBeenCalledTimes(2);
    const [firstWindow, secondWindow] = FakeWindow.instances;
    expect(firstWindow?.close).toHaveBeenCalledTimes(1);
    expect(internals().windows.get('device1')).toBe(secondWindow);
    expect(service.getOpenDeviceIds()).toEqual(['device1']);
  });

  it('does not make different devices wait for each other', async () => {
    scrcpyService.closeMirror.mockImplementationOnce(() => new Promise(() => undefined));

    void service.open('device1', 'A');
    await service.open('device2', 'B');

    expect(service.getOpenDeviceIds()).toEqual(['device2']);
  });

  it('forgets windows on closeAll', async () => {
    await service.open('device1', 'Pixel');
    service.setVideoLayout('device1', 1080, 1920);

    service.closeAll();

    expect(service.getOpenDeviceIds()).toEqual([]);
    expect(internals().layoutApplied.size).toBe(0);
  });
});
