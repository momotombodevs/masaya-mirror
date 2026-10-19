import type { DeviceStatus } from '../../../../shared/device/types';
import type { MessageKey } from '../../../../shared/i18n/messages';

export const DEVICE_STATUS_LABEL_KEYS: Record<DeviceStatus, MessageKey> = {
  device: 'devices.status.device',
  offline: 'devices.status.offline',
  unauthorized: 'devices.status.unauthorized',
  unknown: 'devices.status.unknown',
};
