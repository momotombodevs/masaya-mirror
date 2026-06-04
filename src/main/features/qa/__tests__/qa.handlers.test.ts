import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dialog, ipcMain } from 'electron';
import { registerQaIpcHandlers } from '../ipc/qa.handlers';
import { QA_CHANNELS } from '../../../../shared/ipc/qa.contract';
import type { QaService } from '../qa.service';

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  dialog: { showSaveDialog: vi.fn() },
  clipboard: { writeImage: vi.fn() },
  nativeImage: {
    createFromBuffer: vi.fn(() => ({
      isEmpty: () => false,
    })),
  },
}));

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe('registerQaIpcHandlers', () => {
  const qaService = {
    takeScreenshot: vi.fn(),
  } as unknown as QaService;

  beforeEach(() => {
    vi.clearAllMocks();
    registerQaIpcHandlers(qaService);
  });

  it('registers qa ipc channels', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith(QA_CHANNELS.screenshot, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(QA_CHANNELS.copyCapture, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(QA_CHANNELS.saveCapture, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(QA_CHANNELS.saveRecording, expect.any(Function));
  });

  it('screenshot skips service when dialog canceled', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: true,
      filePath: undefined as unknown as string,
    });

    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([ch]) => ch === QA_CHANNELS.screenshot)?.[1];

    const result = await handler?.({} as never, { deviceId: 'emulator-5554' });
    expect(result).toEqual({ ok: true, value: { saved: false } });
    expect(qaService.takeScreenshot).not.toHaveBeenCalled();
  });

  it('saveRecording writes file when path chosen', async () => {
    vi.mocked(dialog.showSaveDialog).mockResolvedValue({
      canceled: false,
      filePath: '/tmp/recording.webm',
    });

    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([ch]) => ch === QA_CHANNELS.saveRecording)?.[1];

    const buffer = new ArrayBuffer(8);
    const result = await handler?.({} as never, { data: buffer, mimeType: 'video/webm' });
    expect(result).toEqual({ ok: true, value: { saved: true } });
  });
});
