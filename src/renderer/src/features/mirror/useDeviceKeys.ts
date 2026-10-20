import { useCallback } from 'react';
import { useI18n } from '../../shared/i18n';
import { callApi } from '../../shared/manolo-api';
import { keyPressMessages } from './key-press';

/**
 * Presses and releases one Android key on the device (Home, Back, volume, ...). `onError`
 * receives the reason when the press did not reach the device.
 */
export function useDeviceKeys(
  deviceId: string,
  onError?: (message: string) => void,
): (keyCode: number) => void {
  const { t } = useI18n();

  return useCallback(
    (keyCode: number): void => {
      // Both events are sent before waiting, so the device sees down then up without a gap.
      const sends = keyPressMessages(keyCode).map((message) =>
        callApi((api) => api.sendControl(deviceId, message), t('common.noBridge')),
      );
      void Promise.all(sends).then((results) => {
        const failed = results.find((result) => !result.ok);
        if (failed && !failed.ok) {
          onError?.(failed.error);
        }
      });
    },
    [deviceId, onError, t],
  );
}
