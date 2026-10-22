import { err, ok, type Result } from './result';

const INVALID_DEVICE_ID = 'Invalid device identifier.';

/** ADB serial (alphanumeric, dots, dashes) or TCP address (host:port). */
const DEVICE_ID_PATTERN = /^[\w.-]+(?::\d+)?$/;

export function parseDeviceId(payload: unknown): Result<string> {
  if (typeof payload !== 'object' || payload === null || !('deviceId' in payload)) {
    return err(INVALID_DEVICE_ID);
  }

  const { deviceId } = payload as { deviceId: unknown };

  if (typeof deviceId !== 'string') {
    return err(INVALID_DEVICE_ID);
  }

  const trimmed = deviceId.trim();

  if (!trimmed || !DEVICE_ID_PATTERN.test(trimmed)) {
    return err(INVALID_DEVICE_ID);
  }

  return ok(trimmed);
}

/** Host or IPv4 plus a port, as adb names wireless devices. */
const WIFI_ADDRESS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*:(\d{1,5})$/;

/** Wireless adb ids are `host:port`; USB serials and emulators never contain a port. */
export function isWifiDeviceId(deviceId: string): boolean {
  return WIFI_ADDRESS_PATTERN.test(deviceId);
}
