import { useCallback, useEffect, useState } from 'react';
import type { DeviceSettingKey, DeviceSettings } from '../../../../shared/device/types';
import { useI18n } from '../../shared/i18n';
import { callApi } from '../../shared/masaya-api';

export type UseDeviceSettingsResult = {
  /** Null while the phone is being read, or when it could not be read. */
  readonly settings: DeviceSettings | null;
  readonly error: string | null;
  readonly set: (key: DeviceSettingKey, enabled: boolean) => Promise<void>;
};

/** Developer options of the phone (show touches, stay awake), read once and written on demand. */
export function useDeviceSettings(deviceId: string): UseDeviceSettingsResult {
  const { t } = useI18n();
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await callApi(
        (api) => api.getDeviceSettings(deviceId),
        t('deviceSettings.readFailed'),
      );
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setSettings(result.value);
      } else {
        setError(result.error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId, t]);

  const set = useCallback(
    async (key: DeviceSettingKey, enabled: boolean): Promise<void> => {
      const result = await callApi(
        (api) => api.setDeviceSetting(deviceId, key, enabled),
        t('deviceSettings.writeFailed'),
      );
      if (result.ok) {
        setError(null);
        setSettings((current) => (current ? { ...current, [key]: enabled } : current));
      } else {
        setError(result.error);
      }
    },
    [deviceId, t],
  );

  return { settings, error, set };
}
