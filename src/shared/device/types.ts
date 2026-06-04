export type DeviceStatus = 'device' | 'offline' | 'unauthorized' | 'unknown';

export interface AndroidDevice {
  readonly id: string;
  readonly status: DeviceStatus;
  readonly model?: string;
  readonly product?: string;
}
