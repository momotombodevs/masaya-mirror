import type { DeviceStatus } from '../../../../shared/device/types';

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = {
  device: 'Conectado',
  offline: 'Desconectado',
  unauthorized: 'Sin autorizar',
  unknown: 'Desconocido',
};
