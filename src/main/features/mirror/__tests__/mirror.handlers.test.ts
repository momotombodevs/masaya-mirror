import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerMirrorIpcHandlers } from '../ipc/mirror.handlers';
import { MIRROR_CHANNELS } from '../../../../shared/ipc/mirror.contract';
import type { MirrorWindowService } from '../mirror-window.service';
import type { ScrcpyService } from '../scrcpy.service';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

describe('registerMirrorIpcHandlers', () => {
  const scrcpyService = {
    openMirror: vi.fn(),
    closeMirror: vi.fn(),
    getActiveMirrors: vi.fn().mockReturnValue([]),
    sendControl: vi.fn(),
    setOptions: vi.fn(),
    notifyStreamReady: vi.fn(),
  } as unknown as ScrcpyService;

  const mirrorWindowService = {
    open: vi.fn(),
    close: vi.fn(),
    hasWindow: vi.fn(),
    closeAll: vi.fn(),
  } as unknown as MirrorWindowService;

  beforeEach(() => {
    vi.clearAllMocks();
    registerMirrorIpcHandlers(scrcpyService, mirrorWindowService);
  });

  it('registers mirror IPC channels', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith(MIRROR_CHANNELS.streamReady, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(MIRROR_CHANNELS.openWindow, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(MIRROR_CHANNELS.open, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(MIRROR_CHANNELS.close, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(MIRROR_CHANNELS.status, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(MIRROR_CHANNELS.control, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(MIRROR_CHANNELS.setOptions, expect.any(Function));
  });

  it('open validates deviceId', async () => {
    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === MIRROR_CHANNELS.open)?.[1];

    expect(handler).toBeDefined();
    const result = await handler?.({} as never, { deviceId: '' });
    expect(result?.ok).toBe(false);
  });
});
