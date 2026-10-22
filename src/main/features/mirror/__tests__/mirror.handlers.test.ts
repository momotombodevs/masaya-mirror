import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { registerMirrorIpcHandlers } from '../ipc/mirror.handlers';
import { MIRROR_CHANNELS } from '../../../../shared/ipc/mirror.contract';
import type { MirrorWindowService } from '../mirror-window.service';
import type { ScrcpyService } from '../scrcpy.service';
import { MAX_DEVICE_LABEL_LENGTH } from '../ipc/mirror.handlers';

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
}));

describe('registerMirrorIpcHandlers', () => {
  const scrcpyService = {
    openMirror: vi.fn(),
    closeMirror: vi.fn(),
    sendControl: vi.fn(),
    setOptions: vi.fn(),
    notifyStreamReady: vi.fn(),
  } as unknown as ScrcpyService;

  const mirrorWindowService = {
    open: vi.fn(),
    setVideoLayout: vi.fn(),
    closeAll: vi.fn(),
    isSenderForDevice: vi.fn().mockReturnValue(true),
    isMirrorWindowSender: vi.fn().mockReturnValue(false),
    getOpenDeviceIds: vi.fn().mockReturnValue([]),
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

  it('rejects mirror control from a non-owning renderer', async () => {
    vi.mocked(mirrorWindowService.isSenderForDevice).mockReturnValue(false);
    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([channel]) => channel === MIRROR_CHANNELS.control)?.[1];

    const result = await handler?.({ sender: { id: 10 } } as never, {
      deviceId: 'emulator-5554',
      message: { type: 'key', action: 0, keyCode: 3, repeat: 0, metaState: 0 },
    });

    expect(result).toEqual({
      ok: false,
      error: 'The requesting window is not allowed to control this device.',
    });
  });

  describe('openWindow', () => {
    const openWindow = () =>
      vi.mocked(ipcMain.handle).mock.calls.find(([c]) => c === MIRROR_CHANNELS.openWindow)?.[1];

    it('rejects mirror windows as senders', async () => {
      vi.mocked(mirrorWindowService.isMirrorWindowSender).mockReturnValue(true);

      const result = await openWindow()?.({ sender: { id: 10 } } as never, {
        deviceId: 'emulator-5554',
      });

      expect(result?.ok).toBe(false);
      expect(mirrorWindowService.open).not.toHaveBeenCalled();
    });

    it('trims the label and caps its length', async () => {
      vi.mocked(mirrorWindowService.isMirrorWindowSender).mockReturnValue(false);

      await openWindow()?.({ sender: { id: 1 } } as never, {
        deviceId: 'emulator-5554',
        deviceLabel: `  ${'x'.repeat(MAX_DEVICE_LABEL_LENGTH + 50)}  `,
      });

      expect(mirrorWindowService.open).toHaveBeenCalledWith(
        'emulator-5554',
        'x'.repeat(MAX_DEVICE_LABEL_LENGTH),
      );
    });

    it('falls back to the device id without a label', async () => {
      vi.mocked(mirrorWindowService.isMirrorWindowSender).mockReturnValue(false);

      await openWindow()?.({ sender: { id: 1 } } as never, {
        deviceId: 'emulator-5554',
        deviceLabel: '   ',
      });

      expect(mirrorWindowService.open).toHaveBeenCalledWith('emulator-5554', 'emulator-5554');
    });

    it('validates the device id', async () => {
      const result = await openWindow()?.({ sender: { id: 1 } } as never, { deviceId: '' });

      expect(result?.ok).toBe(false);
    });
  });
});
