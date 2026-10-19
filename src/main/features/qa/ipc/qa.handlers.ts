import { clipboard, dialog, ipcMain, nativeImage, type FileFilter } from 'electron';
import { writeFile } from 'node:fs/promises';
import { QA_CHANNELS, type QaActionResponse } from '../../../../shared/ipc/qa.contract';
import { err, ok, type Result } from '../../../../shared/ipc/result';
import type { MirrorWindowService } from '../../mirror/mirror-window.service';

/** Upper bound for renderer-provided buffers to avoid main-process memory exhaustion. */
const MAX_CAPTURE_BYTES = 256 * 1024 * 1024;

type SaveDialogConfig = {
  readonly title: string;
  readonly defaultPath: string;
  readonly filters: readonly FileFilter[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Reads a size-limited `data` buffer from an untrusted payload. */
function readBuffer(payload: unknown): Result<ArrayBuffer> {
  if (!isRecord(payload) || !(payload.data instanceof ArrayBuffer)) {
    return err('Invalid payload.');
  }
  if (payload.data.byteLength > MAX_CAPTURE_BYTES) {
    return err('Payload exceeds the maximum allowed size.');
  }
  return ok(payload.data);
}

async function saveBufferWithDialog(
  config: SaveDialogConfig,
  data: ArrayBuffer,
  fallbackError: string,
): Promise<QaActionResponse> {
  const save = await dialog.showSaveDialog({
    title: config.title,
    defaultPath: config.defaultPath,
    filters: [...config.filters],
  });

  if (save.canceled || !save.filePath) {
    return ok({ saved: false });
  }

  try {
    await writeFile(save.filePath, Buffer.from(data));
    return ok({ saved: true });
  } catch (error: unknown) {
    return err(error instanceof Error ? error.message : fallbackError);
  }
}

export function registerQaIpcHandlers(mirrorWindowService: MirrorWindowService): void {
  /** Registers a channel that only mirror windows may call, with a validated buffer payload. */
  const handleFromMirrorWindow = (
    channel: string,
    run: (data: ArrayBuffer, payload: Record<string, unknown>) => Promise<QaActionResponse>,
  ): void => {
    ipcMain.handle(channel, async (event, payload: unknown): Promise<QaActionResponse> => {
      if (!mirrorWindowService.isMirrorWindowSender(event.sender.id)) {
        return err('The requesting window cannot run QA actions.');
      }
      const data = readBuffer(payload);
      return data.ok ? run(data.value, payload as Record<string, unknown>) : data;
    });
  };

  handleFromMirrorWindow(QA_CHANNELS.copyCapture, async (data) => {
    const image = nativeImage.createFromBuffer(Buffer.from(data));
    if (image.isEmpty()) {
      return err('Unable to read capture image.');
    }
    clipboard.writeImage(image);
    return ok({ copied: true });
  });

  handleFromMirrorWindow(QA_CHANNELS.saveCapture, (data) =>
    saveBufferWithDialog(
      {
        title: 'Save capture',
        defaultPath: `manolo-mirror-${Date.now()}.png`,
        filters: [{ name: 'PNG', extensions: ['png'] }],
      },
      data,
      'Unable to save capture.',
    ),
  );

  handleFromMirrorWindow(QA_CHANNELS.saveRecording, (data, { mimeType }) => {
    if (typeof mimeType !== 'string') {
      return Promise.resolve(err('Invalid recording data.'));
    }
    const extension = mimeType.includes('webm') ? 'webm' : 'mp4';
    return saveBufferWithDialog(
      {
        title: 'Save recording',
        defaultPath: `recording-${Date.now()}.${extension}`,
        filters: [{ name: 'Video', extensions: [extension] }],
      },
      data,
      'Unable to save recording.',
    );
  });
}
