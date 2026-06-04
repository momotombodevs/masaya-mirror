import type { AndroidDevice } from '../device/types';
import type { Result } from './result';

export const DEVICE_CHANNELS = {
  listDevices: 'device:list-devices',
} as const;

export type ListDevicesResponse = Result<readonly AndroidDevice[]>;
