import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dialog, ipcMain } from 'electron';
import { registerQaIpcHandlers } from '../ipc/qa.handlers';
import { QA_CHANNELS } from '../../../../shared/ipc/qa.contract';

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
  const mirrorWindowService = {
    isMirrorWindowSender: vi.fn().mockReturnValue(true),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    registerQaIpcHandlers(mirrorWindowService as never);
  });

  it('registers qa ipc channels', () => {
    expect(ipcMain.handle).toHaveBeenCalledWith(QA_CHANNELS.copyCapture, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(QA_CHANNELS.saveCapture, expect.any(Function));
    expect(ipcMain.handle).toHaveBeenCalledWith(QA_CHANNELS.saveRecording, expect.any(Function));
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
    const result = await handler?.({ sender: { id: 7 } } as never, {
      data: buffer,
      mimeType: 'video/webm',
    });
    expect(result).toEqual({ ok: true, value: { saved: true } });
  });

  it('rejects capture buffers over size limit', async () => {
    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([ch]) => ch === QA_CHANNELS.saveCapture)?.[1];

    const oversized = new ArrayBuffer(257 * 1024 * 1024);
    const result = await handler?.({ sender: { id: 7 } } as never, { data: oversized });
    expect(result).toEqual({
      ok: false,
      error: 'La captura excede el tamaño máximo permitido.',
    });
  });

  it('rejects qa actions from non-mirror windows', async () => {
    mirrorWindowService.isMirrorWindowSender.mockReturnValue(false);

    const handler = vi
      .mocked(ipcMain.handle)
      .mock.calls.find(([ch]) => ch === QA_CHANNELS.copyCapture)?.[1];

    const result = await handler?.(
      { sender: { id: 1 } } as never,
      { data: new ArrayBuffer(8) },
    );

    expect(result).toEqual({
      ok: false,
      error: 'La ventana solicitante no puede ejecutar acciones de QA.',
    });
  });
});
