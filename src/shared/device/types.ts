export type DeviceStatus = 'device' | 'offline' | 'unauthorized' | 'unknown';

export interface AndroidDevice {
  readonly id: string;
  readonly status: DeviceStatus;
  /** As `adb devices -l` prints it, with dashes and spaces turned into underscores. */
  readonly model?: string;
  readonly product?: string;
  /** The name people know the phone by ("Galaxy S23 Ultra"), when it could be worked out. */
  readonly displayName?: string;
}

/** Developer options a mirror window can flip on the phone itself. */
export interface DeviceSettings {
  /** Draws a dot where the screen is touched. */
  readonly showTouches: boolean;
  /** Keeps the screen on while the phone is charging or plugged in. */
  readonly stayAwake: boolean;
}

export type DeviceSettingKey = keyof DeviceSettings;

export const DEVICE_SETTING_KEYS: readonly DeviceSettingKey[] = ['showTouches', 'stayAwake'];
