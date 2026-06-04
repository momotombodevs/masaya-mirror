import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import {
  MIRROR_CHANNELS,
  type CloseMirrorResponse,
  type MirrorControlResponse,
  type MirrorStatusResponse,
  type OpenMirrorResponse,
  type SetMirrorOptionsResponse,
} from '../../../../shared/ipc/mirror.contract';
import { ok, err, type Result } from '../../../../shared/ipc/result';
import { parseDeviceId } from '../../../../shared/ipc/validators';
import {
  DEFAULT_MIRROR_OPTIONS,
  type MirrorControlMessage,
  type MirrorOptions,
} from '../../../../shared/mirror/types';
import type { MirrorWindowService } from '../mirror-window.service';
import type { ScrcpyService } from '../scrcpy.service';

function parseMirrorOptions(value: unknown): Result<MirrorOptions> {
  if (value === undefined || value === null) {
    return ok(DEFAULT_MIRROR_OPTIONS);
  }
  if (typeof value !== 'object') {
    return err('Opciones de mirror inválidas.');
  }
  const raw = value as Record<string, unknown>;
  const maxSize = typeof raw.maxSize === 'number' ? raw.maxSize : DEFAULT_MIRROR_OPTIONS.maxSize;
  const videoBitRate =
    typeof raw.videoBitRate === 'number' ? raw.videoBitRate : DEFAULT_MIRROR_OPTIONS.videoBitRate;
  const videoCodec =
    raw.videoCodec === 'h265' || raw.videoCodec === 'av1' || raw.videoCodec === 'h264'
      ? raw.videoCodec
      : DEFAULT_MIRROR_OPTIONS.videoCodec;
  const audioEnabled =
    typeof raw.audioEnabled === 'boolean' ? raw.audioEnabled : DEFAULT_MIRROR_OPTIONS.audioEnabled;

  return ok({ maxSize, videoBitRate, videoCodec, audioEnabled });
}

function parseControlMessage(value: unknown): Result<MirrorControlMessage> {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return err('Mensaje de control inválido.');
  }
  return ok(value as MirrorControlMessage);
}

export function registerMirrorIpcHandlers(
  scrcpyService: ScrcpyService,
  mirrorWindowService: MirrorWindowService,
): void {
  ipcMain.handle(
    MIRROR_CHANNELS.openWindow,
    async (_, request: unknown) => {
      const parsed = parseDeviceId(request);
      if (!parsed.ok) {
        return parsed;
      }
      const body = request as { deviceId: string; deviceLabel?: unknown };
      const label =
        typeof body.deviceLabel === 'string' && body.deviceLabel.trim().length > 0
          ? body.deviceLabel.trim()
          : parsed.value;
      return mirrorWindowService.open(parsed.value, label);
    },
  );

  ipcMain.handle(
    MIRROR_CHANNELS.setVideoLayout,
    async (_, request: unknown) => {
      if (typeof request !== 'object' || request === null) {
        return err('Solicitud inválida.');
      }
      const body = request as {
        deviceId?: unknown;
        videoWidth?: unknown;
        videoHeight?: unknown;
      };
      const parsed = parseDeviceId({ deviceId: body.deviceId });
      if (!parsed.ok) {
        return parsed;
      }
      const videoWidth = typeof body.videoWidth === 'number' ? body.videoWidth : 0;
      const videoHeight = typeof body.videoHeight === 'number' ? body.videoHeight : 0;
      return mirrorWindowService.setVideoLayout(parsed.value, videoWidth, videoHeight);
    },
  );

  ipcMain.handle(
    MIRROR_CHANNELS.streamReady,
    async (_, request: unknown) => {
      const parsed = parseDeviceId(request);
      if (!parsed.ok) {
        return parsed;
      }
      return scrcpyService.notifyStreamReady(parsed.value);
    },
  );

  ipcMain.handle(
    MIRROR_CHANNELS.open,
    async (event: IpcMainInvokeEvent, request: unknown): Promise<OpenMirrorResponse> => {
      const parsed = parseDeviceId(request);
      if (!parsed.ok) {
        return parsed;
      }

      const body = request as { deviceId: string; options?: unknown };
      const optionsResult = parseMirrorOptions(body.options);
      if (!optionsResult.ok) {
        return optionsResult;
      }

      return scrcpyService.openMirror(
        parsed.value,
        event.sender,
        optionsResult.value,
      );
    },
  );

  ipcMain.handle(
    MIRROR_CHANNELS.close,
    async (_, request: unknown): Promise<CloseMirrorResponse> => {
      const parsed = parseDeviceId(request);
      if (!parsed.ok) {
        return parsed;
      }
      return scrcpyService.closeMirror(parsed.value);
    },
  );

  ipcMain.handle(MIRROR_CHANNELS.status, async (): Promise<MirrorStatusResponse> => {
    return ok({ activeDeviceIds: scrcpyService.getActiveMirrors() });
  });

  ipcMain.handle(
    MIRROR_CHANNELS.control,
    async (_, request: unknown): Promise<MirrorControlResponse> => {
      if (typeof request !== 'object' || request === null) {
        return err('Solicitud de control inválida.');
      }
      const body = request as { deviceId?: unknown; message?: unknown };
      const deviceParsed = parseDeviceId({ deviceId: body.deviceId });
      if (!deviceParsed.ok) {
        return deviceParsed;
      }
      const messageParsed = parseControlMessage(body.message);
      if (!messageParsed.ok) {
        return messageParsed;
      }
      return scrcpyService.sendControl(deviceParsed.value, messageParsed.value);
    },
  );

  ipcMain.handle(
    MIRROR_CHANNELS.setOptions,
    async (event: IpcMainInvokeEvent, request: unknown): Promise<SetMirrorOptionsResponse> => {
      if (typeof request !== 'object' || request === null) {
        return err('Solicitud inválida.');
      }
      const body = request as { deviceId?: unknown; options?: unknown };
      const deviceParsed = parseDeviceId({ deviceId: body.deviceId });
      if (!deviceParsed.ok) {
        return deviceParsed;
      }
      const optionsParsed = parseMirrorOptions(body.options);
      if (!optionsParsed.ok) {
        return optionsParsed;
      }
      return scrcpyService.setOptions(
        deviceParsed.value,
        event.sender,
        optionsParsed.value,
      );
    },
  );
}
