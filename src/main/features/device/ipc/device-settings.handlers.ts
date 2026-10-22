import {
  DEVICE_CHANNELS,
  type GetDeviceSettingsResponse,
  type SetDeviceSettingResponse,
} from '../../../../shared/ipc/device.contract';
import { DEVICE_SETTING_KEYS } from '../../../../shared/device/types';
import { err } from '../../../../shared/ipc/result';
import { handleOwnedDevice } from '../../../ipc/handle-ipc';
import type { MirrorWindowService } from '../../mirror/mirror-window.service';
import type { AdbService } from '../adb.service';
import { mt } from '../../../i18n';

/** Developer options of the phone shown in a mirror window. Only that window may change them. */
export function registerDeviceSettingsIpcHandlers(
  adbService: AdbService,
  mirrorWindowService: MirrorWindowService,
): void {
  handleOwnedDevice(
    DEVICE_CHANNELS.getSettings,
    mirrorWindowService,
    ({ deviceId }): Promise<GetDeviceSettingsResponse> => adbService.getDeviceSettings(deviceId),
  );

  handleOwnedDevice(
    DEVICE_CHANNELS.setSetting,
    mirrorWindowService,
    async ({ deviceId, body }): Promise<SetDeviceSettingResponse> => {
      const key = DEVICE_SETTING_KEYS.find((candidate) => candidate === body.key);
      if (!key || typeof body.enabled !== 'boolean') {
        return err(mt('main.invalidSetting'));
      }
      return adbService.setDeviceSetting(deviceId, key, body.enabled);
    },
  );
}
