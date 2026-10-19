import { useCallback, useEffect, useState } from 'react';
import type { DeviceSettingKey, DeviceSettings } from '../../../../shared/device/types';
import { getManoloApi } from '../../shared/manolo-api';

export type UseDeviceSettingsResult = {
  /** Null while the phone is being read, or when it could not be read. */
  readonly settings: DeviceSettings | null;
  readonly error: string | null;
  readonly set: (key: DeviceSettingKey, enabled: boolean) => Promise<void>;
};

/** Developer options of the phone (show touches, stay awake), read once and written on demand. */
export function useDeviceSettings(deviceId: string): UseDeviceSettingsResult {
  const [settings, setSettings] = useState<DeviceSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getManoloApi()
        ?.getDeviceSettings(deviceId)
        .catch(() => undefined);
      if (cancelled) {
        return;
      }
      if (result?.ok) {
        setSettings(result.value);
      } else {
        setError(result?.ok === false ? result.error : 'No se pudo leer el dispositivo.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const set = useCallback(
    async (key: DeviceSettingKey, enabled: boolean): Promise<void> => {
      const result = await getManoloApi()?.setDeviceSetting(deviceId, key, enabled);
      if (result?.ok) {
        setError(null);
        setSettings((current) => (current ? { ...current, [key]: enabled } : current));
      } else {
        setError(result?.ok === false ? result.error : 'No se pudo cambiar el ajuste.');
      }
    },
    [deviceId],
  );

  return { settings, error, set };
}
