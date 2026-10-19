import type { AndroidDevice } from '../../../../shared/device/types';

export type DeviceSummary = {
  /** Devices that are online and ready to mirror (ADB status `device`). */
  readonly connected: readonly AndroidDevice[];
  /** Devices ADB sees but cannot mirror yet (unauthorized, offline, ...). */
  readonly unavailable: readonly AndroidDevice[];
  readonly liveCount: number;
};

export function summarizeDevices(
  devices: readonly AndroidDevice[],
  activeDeviceIds: readonly string[],
): DeviceSummary {
  return {
    connected: devices.filter((device) => device.status === 'device'),
    unavailable: devices.filter((device) => device.status !== 'device'),
    liveCount: activeDeviceIds.length,
  };
}
