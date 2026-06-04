import { clipboard, dialog, ipcMain, nativeImage } from 'electron';
import { writeFile } from 'node:fs/promises';
import {
  QA_CHANNELS,
  type CaptureImageRequest,
  type QaActionResponse,
  type SaveRecordingRequest,
} from '../../../../shared/ipc/qa.contract';
import { err, ok } from '../../../../shared/ipc/result';
import { parseDeviceId } from '../../../../shared/ipc/validators';
import type { QaService } from '../qa.service';

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

export function registerQaIpcHandlers(qaService: QaService): void {
  ipcMain.handle(
    QA_CHANNELS.screenshot,
    async (_, request: unknown): Promise<QaActionResponse> => {
      const parsed = parseDeviceId(request);
      if (!parsed.ok) {
        return parsed;
      }

      const save = await dialog.showSaveDialog({
        title: 'Guardar captura',
        defaultPath: `screenshot-${Date.now()}.png`,
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });

      if (save.canceled || !save.filePath) {
        return ok({ saved: false });
      }

      const result = await qaService.takeScreenshot(parsed.value, save.filePath);
      if (!result.ok) {
        return result;
      }
      return ok({ saved: true });
    },
  );

  ipcMain.handle(
    QA_CHANNELS.copyCapture,
    async (_, request: unknown): Promise<QaActionResponse> => {
      const body = parseCaptureImageRequest(request);
      if (!body) {
        return err('Imagen de captura inválida.');
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
    async (_, request: unknown): Promise<QaActionResponse> => {
      const body = parseCaptureImageRequest(request);
      if (!body) {
        return err('Imagen de captura inválida.');
      }

      const save = await dialog.showSaveDialog({
        title: 'Guardar captura',
        defaultPath: `manolo-mirror-${Date.now()}.png`,
        filters: [{ name: 'PNG', extensions: ['png'] }],
      });

      if (save.canceled || !save.filePath) {
        return ok({ saved: false });
      }

      try {
        await writeFile(save.filePath, Buffer.from(body.data));
        return ok({ saved: true });
      } catch (error: unknown) {
        if (error instanceof Error) {
          return err(error.message);
        }
        return err('No se pudo guardar la captura.');
      }
    },
  );

  ipcMain.handle(
    QA_CHANNELS.saveRecording,
    async (_, request: unknown): Promise<QaActionResponse> => {
      const body = parseSaveRecordingRequest(request);
      if (!body) {
        return err('Datos de grabación inválidos.');
      }

      const extension = body.mimeType.includes('webm') ? 'webm' : 'mp4';
      const save = await dialog.showSaveDialog({
        title: 'Guardar grabación',
        defaultPath: `recording-${Date.now()}.${extension}`,
        filters: [{ name: 'Video', extensions: [extension] }],
      });

      if (save.canceled || !save.filePath) {
        return ok({ saved: false });
      }

      try {
        await writeFile(save.filePath, Buffer.from(body.data));
        return ok({ saved: true });
      } catch (error: unknown) {
        if (error instanceof Error) {
          return err(error.message);
        }
        return err('No se pudo guardar la grabación.');
      }
    },
  );
}
