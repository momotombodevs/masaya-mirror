import type { AndroidDevice } from '../../../../shared/device/types';

/** Devices that are online and ready to mirror (ADB status `device`). */
export function selectConnectedDevices(
  devices: readonly AndroidDevice[],
): readonly AndroidDevice[] {
  return devices.filter((device) => device.status === 'device');
}
