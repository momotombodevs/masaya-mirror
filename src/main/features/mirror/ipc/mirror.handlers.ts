import { ipcMain } from 'electron';
import { MIRROR_CHANNELS, type MirrorStatusResponse } from '../../../../shared/ipc/mirror.contract';
import { err, ok } from '../../../../shared/ipc/result';
import { parseDeviceId } from '../../../../shared/ipc/validators';
import type { MirrorWindowService } from '../mirror-window.service';
import type { ScrcpyService } from '../scrcpy.service';
import { handleOwnedDevice, type DeviceHandler } from './device-handler';
import { parseControlMessage, parseMirrorOptions, parseVideoLayout } from './mirror-parsers';
import { mt } from '../../../i18n';

export function registerMirrorIpcHandlers(
  scrcpyService: ScrcpyService,
  mirrorWindowService: MirrorWindowService,
): void {
  // Opening a window is requested from the device list, so it has no owning window yet.
  ipcMain.handle(MIRROR_CHANNELS.openWindow, async (_event, request: unknown) => {
    const device = parseDeviceId(request);
    if (!device.ok) {
      return device;
    }
    const { deviceLabel } = request as { deviceLabel?: unknown };
    const label = typeof deviceLabel === 'string' ? deviceLabel.trim() : '';
    return mirrorWindowService.open(device.value, label || device.value);
  });

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
    return message.ok ? scrcpyService.sendControl(deviceId, message.value) : message;
  });
}
