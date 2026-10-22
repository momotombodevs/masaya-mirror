import type { IconTileTone } from '../../components/ui/IconTile';
import type { DeviceStatus } from '../../../../shared/device/types';
import { isWifiDeviceId } from '../../../../shared/ipc/validators';
import type { MessageKey } from '../../../../shared/i18n/messages';

export const DEVICE_STATUS_LABEL_KEYS: Record<DeviceStatus, MessageKey> = {
  device: 'devices.status.device',
  offline: 'devices.status.offline',
  unauthorized: 'devices.status.unauthorized',
  unknown: 'devices.status.unknown',
};

const DEVICE_TONES: readonly IconTileTone[] = ['indigo', 'purple', 'teal', 'orange', 'green'];

/** A stable tile color per device, so each phone keeps its color between refreshes. */
export function deviceTone(deviceId: string): IconTileTone {
  let hash = 0;
  for (const char of deviceId) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return DEVICE_TONES[hash % DEVICE_TONES.length] ?? 'indigo';
}

export type DeviceConnection = 'usb' | 'wifi' | 'emulator';

const EMULATOR_ID = /^emulator-\d+$/;

/** How the computer reaches a device, read from its adb id. */
export function deviceConnection(deviceId: string): DeviceConnection {
  if (isWifiDeviceId(deviceId)) {
    return 'wifi';
  }
  return EMULATOR_ID.test(deviceId) ? 'emulator' : 'usb';
}
