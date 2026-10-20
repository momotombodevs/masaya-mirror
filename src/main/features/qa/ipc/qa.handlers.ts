import { clipboard, dialog, ipcMain, nativeImage, type FileFilter } from 'electron';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { QA_CHANNELS, type QaActionResponse } from '../../../../shared/ipc/qa.contract';
import { err, ok, type Result } from '../../../../shared/ipc/result';
import type { MirrorWindowService } from '../../mirror/mirror-window.service';
import type { PreferencesService } from '../../preferences/preferences.service';
import { mt } from '../../../i18n';

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

function recordingExtension(mimeType: string): 'gif' | 'webm' | 'mp4' {
  if (mimeType.includes('gif')) {
    return 'gif';
  }
  return mimeType.includes('webm') ? 'webm' : 'mp4';
}

/** `2026-10-19_18-45-02`, sortable and safe in file names on every platform. */
function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
}

async function saveBufferWithDialog(
  config: SaveDialogConfig,
  data: ArrayBuffer,
  fallbackError: string,
  preferences: PreferencesService,
): Promise<QaActionResponse> {
  const folder = preferences.getSaveDirectory();
  const save = await dialog.showSaveDialog({
    title: config.title,
    defaultPath: folder ? path.join(folder, config.defaultPath) : config.defaultPath,
    filters: [...config.filters],
  });

  if (save.canceled || !save.filePath) {
    return ok({ saved: false });
  }

  try {
    await writeFile(save.filePath, Buffer.from(data));
    preferences.setSaveDirectory(path.dirname(save.filePath));
    return ok({ saved: true });
  } catch (error: unknown) {
    return err(error instanceof Error ? error.message : fallbackError);
  }
}

export function registerQaIpcHandlers(
  mirrorWindowService: MirrorWindowService,
  preferences: PreferencesService,
): void {
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
        title: mt('main.saveCaptureTitle'),
        defaultPath: `captura_${timestamp()}.png`,
        filters: [{ name: 'PNG', extensions: ['png'] }],
      },
      data,
      'Unable to save capture.',
      preferences,
    ),
  );

  handleFromMirrorWindow(QA_CHANNELS.saveRecording, (data, { mimeType }) => {
    if (typeof mimeType !== 'string') {
      return Promise.resolve(err('Invalid recording data.'));
    }
    const extension = recordingExtension(mimeType);
    return saveBufferWithDialog(
      {
        title: mt('main.saveRecordingTitle'),
        defaultPath: `grabacion_${timestamp()}.${extension}`,
        filters: [{ name: extension === 'gif' ? 'GIF' : 'Video', extensions: [extension] }],
      },
      data,
      'Unable to save recording.',
      preferences,
    );
  });
}
