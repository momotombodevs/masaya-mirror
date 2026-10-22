import { ipcMain } from 'electron';
import { MIRROR_CHANNELS, type MirrorStatusResponse } from '../../../../shared/ipc/mirror.contract';
import { err, ok, type Result } from '../../../../shared/ipc/result';
import { parseDeviceId } from '../../../../shared/ipc/validators';
import {
  fromMainWindow,
  handleIpc,
  handleOwnedDevice,
  type DeviceRequest,
} from '../../../ipc/handle-ipc';
import type { MirrorWindowService } from '../mirror-window.service';
import type { ScrcpyService } from '../scrcpy.service';
import {
  describeRejectedControl,
  parseControlMessage,
  parseMirrorOptions,
  parseVideoLayout,
} from './mirror-parsers';
import { log } from '../../../logging/log';
import { mt } from '../../../i18n';

type DeviceHandler<T> = (request: DeviceRequest) => Result<T> | Promise<Result<T>>;

/** A device label is only a window title; anything longer is noise or abuse. */
export const MAX_DEVICE_LABEL_LENGTH = 200;

export function registerMirrorIpcHandlers(
  scrcpyService: ScrcpyService,
  mirrorWindowService: MirrorWindowService,
): void {
  // Opening a window is requested from the device list, so it has no owning window yet.
  handleIpc(
    MIRROR_CHANNELS.openWindow,
    fromMainWindow(mirrorWindowService),
    async ({ payload }): Promise<Result<void>> => {
      const device = parseDeviceId(payload);
      if (!device.ok) {
        return device;
      }
      const { deviceLabel } = payload as { deviceLabel?: unknown };
      const label = typeof deviceLabel === 'string' ? deviceLabel.trim() : '';
      return mirrorWindowService.open(
        device.value,
        label.slice(0, MAX_DEVICE_LABEL_LENGTH) || device.value,
      );
    },
  );

  ipcMain.handle(MIRROR_CHANNELS.status, async (): Promise<MirrorStatusResponse> =>
    ok({ activeDeviceIds: mirrorWindowService.getOpenDeviceIds() }),
  );

  const ownedDevice = <T>(channel: string, handler: DeviceHandler<T>): void =>
    handleOwnedDevice(channel, mirrorWindowService, handler);

  ownedDevice(MIRROR_CHANNELS.setVideoLayout, ({ deviceId, body }) => {
    const layout = parseVideoLayout(body);
    return layout.ok
      ? mirrorWindowService.setVideoLayout(
          deviceId,
          layout.value.videoWidth,
          layout.value.videoHeight,
        )
      : layout;
  });

  ownedDevice(MIRROR_CHANNELS.setAlwaysOnTop, ({ deviceId, body }) =>
    typeof body.enabled === 'boolean'
      ? mirrorWindowService.setAlwaysOnTop(deviceId, body.enabled)
      : err(mt('main.invalidSetting')),
  );

  ownedDevice(MIRROR_CHANNELS.streamReady, ({ deviceId }) =>
    scrcpyService.notifyStreamReady(deviceId),
  );

  ownedDevice(MIRROR_CHANNELS.open, ({ deviceId, body, sender }) => {
    const options = parseMirrorOptions(body.options);
    return options.ok ? scrcpyService.openMirror(deviceId, sender, options.value) : options;
  });

  ownedDevice(MIRROR_CHANNELS.setOptions, ({ deviceId, body, sender }) => {
    const options = parseMirrorOptions(body.options);
    return options.ok ? scrcpyService.setOptions(deviceId, sender, options.value) : options;
  });

  ownedDevice(MIRROR_CHANNELS.close, ({ deviceId }) => scrcpyService.closeMirror(deviceId));

  ownedDevice(MIRROR_CHANNELS.control, ({ deviceId, body }) => {
    const message = parseControlMessage(body.message);
    if (!message.ok) {
      // Pointer moves arrive many times a second; a counter keeps a bad sender to a few lines.
      log.count('mirror', `control rejected: ${describeRejectedControl(body.message)}`);
      return message;
    }
    return scrcpyService.sendControl(deviceId, message.value);
  });
}
