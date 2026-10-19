import { useCallback } from 'react';
import { ANDROID_KEY_EVENT_ACTION } from '../../../../shared/mirror/types';
import { getManoloApi } from '../../shared/manolo-api';

/** Presses and releases one Android key on the device (Home, Back, volume, ...). */
export function useDeviceKeys(deviceId: string): (keyCode: number) => void {
  return useCallback(
    (keyCode: number): void => {
      const api = getManoloApi();
      if (!api) {
        return;
      }
      for (const action of [ANDROID_KEY_EVENT_ACTION.down, ANDROID_KEY_EVENT_ACTION.up]) {
        void api.sendControl(deviceId, { type: 'key', action, keyCode, repeat: 0, metaState: 0 });
      }
    },
    [deviceId],
  );
}
