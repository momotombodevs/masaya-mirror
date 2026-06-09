import { clipboard, dialog, ipcMain, nativeImage, type FileFilter } from 'electron';
import { writeFile } from 'node:fs/promises';
import {
  QA_CHANNELS,
  type CaptureImageRequest,
  type QaActionResponse,
  type SaveRecordingRequest,
} from '../../../../shared/ipc/qa.contract';
import { err, ok } from '../../../../shared/ipc/result';
import type { MirrorWindowService } from '../../mirror/mirror-window.service';

/** Upper bound for renderer-provided buffers to avoid main-process memory exhaustion. */
const MAX_CAPTURE_BYTES = 256 * 1024 * 1024;

function parseCaptureImageRequest(value: unknown): CaptureImageRequest | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const body = value as { data?: unknown };
  if (!(body.data instanceof ArrayBuffer)) {
    return null;
  }
  return { data: body.data };
}

function parseSaveRecordingRequest(value: unknown): SaveRecordingRequest | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const body = value as { data?: unknown; mimeType?: unknown };
  if (!(body.data instanceof ArrayBuffer) || typeof body.mimeType !== 'string') {
    return null;
  }
  return { data: body.data, mimeType: body.mimeType };
}

function exceedsSizeLimit(data: ArrayBuffer): boolean {
  return data.byteLength > MAX_CAPTURE_BYTES;
}

type SaveDialogConfig = {
  readonly title: string;
  readonly defaultPath: string;
  readonly filters: readonly FileFilter[];
};

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
  ipcMain.handle(
    QA_CHANNELS.copyCapture,
    async (event, request: unknown): Promise<QaActionResponse> => {
      if (!mirrorWindowService.isMirrorWindowSender(event.sender.id)) {
        return err('La ventana solicitante no puede ejecutar acciones de QA.');
      }
      const body = parseCaptureImageRequest(request);
      if (!body) {
        return err('Imagen de captura inválida.');
      }
      if (exceedsSizeLimit(body.data)) {
        return err('La captura excede el tamaño máximo permitido.');
      }

      const image = nativeImage.createFromBuffer(Buffer.from(body.data));
      if (image.isEmpty()) {
        return err('No se pudo leer la captura.');
      }

      clipboard.writeImage(image);
      return ok({ copied: true });
    },
  );

  ipcMain.handle(
    QA_CHANNELS.saveCapture,
    async (event, request: unknown): Promise<QaActionResponse> => {
      if (!mirrorWindowService.isMirrorWindowSender(event.sender.id)) {
        return err('La ventana solicitante no puede ejecutar acciones de QA.');
      }
      const body = parseCaptureImageRequest(request);
      if (!body) {
        return err('Imagen de captura inválida.');
      }
      if (exceedsSizeLimit(body.data)) {
        return err('La captura excede el tamaño máximo permitido.');
      }

      return saveBufferWithDialog(
        {
          title: 'Guardar captura',
          defaultPath: `manolo-mirror-${Date.now()}.png`,
          filters: [{ name: 'PNG', extensions: ['png'] }],
        },
        body.data,
        'No se pudo guardar la captura.',
      );
    },
  );

  ipcMain.handle(
    QA_CHANNELS.saveRecording,
    async (event, request: unknown): Promise<QaActionResponse> => {
      if (!mirrorWindowService.isMirrorWindowSender(event.sender.id)) {
        return err('La ventana solicitante no puede ejecutar acciones de QA.');
      }
      const body = parseSaveRecordingRequest(request);
      if (!body) {
        return err('Datos de grabación inválidos.');
      }
      if (exceedsSizeLimit(body.data)) {
        return err('La grabación excede el tamaño máximo permitido.');
      }

      const extension = body.mimeType.includes('webm') ? 'webm' : 'mp4';
      return saveBufferWithDialog(
        {
          title: 'Guardar grabación',
          defaultPath: `recording-${Date.now()}.${extension}`,
          filters: [{ name: 'Video', extensions: [extension] }],
        },
        body.data,
        'No se pudo guardar la grabación.',
      );
    },
  );
}
