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
  MAX_MIRROR_TEXT_BYTES,
  type MirrorControlMessage,
  type MirrorOptions,
} from '../../../../shared/mirror/types';
import type { MirrorWindowService } from '../mirror-window.service';
import type { ScrcpyService } from '../scrcpy.service';

const MIN_VIDEO_BIT_RATE = 1_000_000;
const MAX_VIDEO_BIT_RATE = 100_000_000;
const MIN_MAX_SIZE = 256;
const MAX_MAX_SIZE = 8192;
const MAX_VIDEO_DIMENSION = 10_000;
const MAX_POINTER_ID = Number.MAX_SAFE_INTEGER;
const MAX_ANDROID_KEYCODE = 400;
const MAX_REPEAT_COUNT = 100;
const MAX_META_STATE = 0xffff;
const MAX_ANDROID_BUTTON_MASK = 0xffff;

function parseFiniteNumber(
  value: unknown,
  defaultValue: number | undefined,
  min: number,
  max: number,
): Result<number> {
  if (value === undefined) {
    if (defaultValue === undefined) {
      return err('Missing numeric value.');
    }
    return ok(defaultValue);
  }

  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    return err('Invalid numeric value.');
  }

  return ok(value);
}

function ensureDeviceSender(
  mirrorWindowService: MirrorWindowService,
  senderId: number,
  deviceId: string,
): Result<void> {
  if (!mirrorWindowService.isSenderForDevice(deviceId, senderId)) {
    return err('The requesting window is not allowed to control this device.');
  }

  return ok(undefined);
}

function parseMirrorOptions(value: unknown): Result<MirrorOptions> {
  if (value === undefined || value === null) {
    return ok(DEFAULT_MIRROR_OPTIONS);
  }
  if (typeof value !== 'object') {
    return err('Invalid mirror options.');
  }
  const raw = value as Record<string, unknown>;
  const maxSizeResult = parseFiniteNumber(
    raw.maxSize,
    DEFAULT_MIRROR_OPTIONS.maxSize,
    MIN_MAX_SIZE,
    MAX_MAX_SIZE,
  );
  if (!maxSizeResult.ok) {
    return err('Invalid maxSize.');
  }

  const videoBitRateResult = parseFiniteNumber(
    raw.videoBitRate,
    DEFAULT_MIRROR_OPTIONS.videoBitRate,
    MIN_VIDEO_BIT_RATE,
    MAX_VIDEO_BIT_RATE,
  );
  if (!videoBitRateResult.ok) {
    return err('Invalid videoBitRate.');
  }

  const videoCodec =
    raw.videoCodec === 'h265' || raw.videoCodec === 'h264'
      ? raw.videoCodec
      : DEFAULT_MIRROR_OPTIONS.videoCodec;
  const audioEnabled =
    typeof raw.audioEnabled === 'boolean' ? raw.audioEnabled : DEFAULT_MIRROR_OPTIONS.audioEnabled;

  return ok({
    maxSize: Math.round(maxSizeResult.value),
    videoBitRate: Math.round(videoBitRateResult.value),
    videoCodec,
    audioEnabled,
  });
}

function parseVideoDimension(value: unknown, fieldName: string): Result<number> {
  const dimension = parseFiniteNumber(value, 0, 1, MAX_VIDEO_DIMENSION);
  if (!dimension.ok) {
    return err(`Invalid ${fieldName}.`);
  }

  return ok(Math.round(dimension.value));
}

function parseControlMessage(value: unknown): Result<MirrorControlMessage> {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return err('Invalid control message.');
  }

  const raw = value as Record<string, unknown>;
  switch (raw.type) {
    case 'touch': {
      const action = parseFiniteNumber(raw.action, -1, 0, 2);
      const pointerId = parseFiniteNumber(raw.pointerId, -1, 0, MAX_POINTER_ID);
      const pointerX = parseFiniteNumber(raw.pointerX, -1, 0, MAX_VIDEO_DIMENSION);
      const pointerY = parseFiniteNumber(raw.pointerY, -1, 0, MAX_VIDEO_DIMENSION);
      const videoWidth = parseVideoDimension(raw.videoWidth, 'videoWidth');
      const videoHeight = parseVideoDimension(raw.videoHeight, 'videoHeight');
      const pressure = parseFiniteNumber(raw.pressure, -1, 0, 1);
      const buttons = parseFiniteNumber(raw.buttons, 0, 0, MAX_ANDROID_BUTTON_MASK);
      const actionButton = parseFiniteNumber(raw.actionButton, 0, 0, MAX_ANDROID_BUTTON_MASK);

      if (!action.ok || !pointerId.ok || !pointerX.ok || !pointerY.ok) {
        return err('Invalid touch message.');
      }
      if (!videoWidth.ok || !videoHeight.ok || !pressure.ok || !buttons.ok || !actionButton.ok) {
        return err('Invalid touch message.');
      }

      return ok({
        type: 'touch',
        action: Math.round(action.value),
        pointerId: Math.round(pointerId.value),
        pointerX: Math.round(pointerX.value),
        pointerY: Math.round(pointerY.value),
        videoWidth: videoWidth.value,
        videoHeight: videoHeight.value,
        pressure: pressure.value,
        buttons: Math.round(buttons.value),
        actionButton: Math.round(actionButton.value),
      });
    }

    case 'scroll': {
      const pointerX = parseFiniteNumber(raw.pointerX, -1, 0, MAX_VIDEO_DIMENSION);
      const pointerY = parseFiniteNumber(raw.pointerY, -1, 0, MAX_VIDEO_DIMENSION);
      const videoWidth = parseVideoDimension(raw.videoWidth, 'videoWidth');
      const videoHeight = parseVideoDimension(raw.videoHeight, 'videoHeight');
      const scrollX = parseFiniteNumber(raw.scrollX, 0, -10, 10);
      const scrollY = parseFiniteNumber(raw.scrollY, 0, -10, 10);
      const buttons = parseFiniteNumber(raw.buttons, 0, 0, MAX_ANDROID_BUTTON_MASK);

      if (!pointerX.ok || !pointerY.ok || !videoWidth.ok || !videoHeight.ok) {
        return err('Invalid scroll message.');
      }
      if (!scrollX.ok || !scrollY.ok || !buttons.ok) {
        return err('Invalid scroll message.');
      }

      return ok({
        type: 'scroll',
        pointerX: Math.round(pointerX.value),
        pointerY: Math.round(pointerY.value),
        videoWidth: videoWidth.value,
        videoHeight: videoHeight.value,
        scrollX: scrollX.value,
        scrollY: scrollY.value,
        buttons: Math.round(buttons.value),
      });
    }

    case 'key': {
      const action = parseFiniteNumber(raw.action, -1, 0, 1);
      const keyCode = parseFiniteNumber(raw.keyCode, -1, 0, MAX_ANDROID_KEYCODE);
      const repeat = parseFiniteNumber(raw.repeat, 0, 0, MAX_REPEAT_COUNT);
      const metaState = parseFiniteNumber(raw.metaState, 0, 0, MAX_META_STATE);

      if (!action.ok || !keyCode.ok || !repeat.ok || !metaState.ok) {
        return err('Invalid key message.');
      }

      return ok({
        type: 'key',
        action: Math.round(action.value),
        keyCode: Math.round(keyCode.value),
        repeat: Math.round(repeat.value),
        metaState: Math.round(metaState.value),
      });
    }

    case 'text': {
      if (typeof raw.text !== 'string' || raw.text.length === 0) {
        return err('Invalid text message.');
      }
      if (new TextEncoder().encode(raw.text).byteLength > MAX_MIRROR_TEXT_BYTES) {
        return err('Text message is too long.');
      }
      return ok({ type: 'text', text: raw.text });
    }

    default:
      return err('Invalid control message.');
  }
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
    async (event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = parseDeviceId(request);
      if (!parsed.ok) {
        return parsed;
      }
      const senderAccess = ensureDeviceSender(mirrorWindowService, event.sender.id, parsed.value);
      if (!senderAccess.ok) {
        return senderAccess;
      }
      const body = request as { videoWidth?: unknown; videoHeight?: unknown };
      const videoWidth = parseVideoDimension(body.videoWidth, 'videoWidth');
      if (!videoWidth.ok) {
        return videoWidth;
      }
      const videoHeight = parseVideoDimension(body.videoHeight, 'videoHeight');
      if (!videoHeight.ok) {
        return videoHeight;
      }
      return mirrorWindowService.setVideoLayout(parsed.value, videoWidth.value, videoHeight.value);
    },
  );

  ipcMain.handle(
    MIRROR_CHANNELS.streamReady,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      const parsed = parseDeviceId(request);
      if (!parsed.ok) {
        return parsed;
      }
      const senderAccess = ensureDeviceSender(mirrorWindowService, event.sender.id, parsed.value);
      if (!senderAccess.ok) {
        return senderAccess;
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
      const senderAccess = ensureDeviceSender(mirrorWindowService, event.sender.id, parsed.value);
      if (!senderAccess.ok) {
        return senderAccess;
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
    async (event: IpcMainInvokeEvent, request: unknown): Promise<CloseMirrorResponse> => {
      const parsed = parseDeviceId(request);
      if (!parsed.ok) {
        return parsed;
      }
      const senderAccess = ensureDeviceSender(mirrorWindowService, event.sender.id, parsed.value);
      if (!senderAccess.ok) {
        return senderAccess;
      }
      return scrcpyService.closeMirror(parsed.value);
    },
  );

  ipcMain.handle(MIRROR_CHANNELS.status, async (): Promise<MirrorStatusResponse> => {
    return ok({ activeDeviceIds: mirrorWindowService.getOpenDeviceIds() });
  });

  ipcMain.handle(
    MIRROR_CHANNELS.control,
    async (event: IpcMainInvokeEvent, request: unknown): Promise<MirrorControlResponse> => {
      const deviceParsed = parseDeviceId(request);
      if (!deviceParsed.ok) {
        return deviceParsed;
      }
      const senderAccess = ensureDeviceSender(
        mirrorWindowService,
        event.sender.id,
        deviceParsed.value,
      );
      if (!senderAccess.ok) {
        return senderAccess;
      }
      const body = request as { message?: unknown };
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
      const deviceParsed = parseDeviceId(request);
      if (!deviceParsed.ok) {
        return deviceParsed;
      }
      const body = request as { options?: unknown };
      const optionsParsed = parseMirrorOptions(body.options);
      if (!optionsParsed.ok) {
        return optionsParsed;
      }
      const senderAccess = ensureDeviceSender(
        mirrorWindowService,
        event.sender.id,
        deviceParsed.value,
      );
      if (!senderAccess.ok) {
        return senderAccess;
      }
      return scrcpyService.setOptions(
        deviceParsed.value,
        event.sender,
        optionsParsed.value,
      );
    },
  );
}
