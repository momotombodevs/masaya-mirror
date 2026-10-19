import { err, ok, type Result } from './result';

/** ADB serial (alphanumeric, dots, dashes) or TCP address (host:port). */
const DEVICE_ID_PATTERN = /^[\w.-]+(?::\d+)?$/;

export function parseDeviceId(payload: unknown): Result<string> {
  if (typeof payload !== 'object' || payload === null || !('deviceId' in payload)) {
    return err('Identificador de dispositivo inválido.');
  }

  const { deviceId } = payload as { deviceId: unknown };

  if (typeof deviceId !== 'string') {
    return err('Identificador de dispositivo inválido.');
  }

  const trimmed = deviceId.trim();

  if (!trimmed || !DEVICE_ID_PATTERN.test(trimmed)) {
    return err('Identificador de dispositivo inválido.');
  }

  return ok(trimmed);
}

/** Host or IPv4 plus a port. The host must start with an alphanumeric so it can never read as an adb option. */
const WIFI_ADDRESS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.-]*:(\d{1,5})$/;

const WIFI_ADDRESS_ERROR = 'Dirección inválida. Usa el formato 192.168.1.20:5555.';

export function parseWifiAddress(value: unknown): Result<string> {
  if (typeof value !== 'string') {
    return err(WIFI_ADDRESS_ERROR);
  }
  const address = value.trim();
  const port = WIFI_ADDRESS_PATTERN.exec(address)?.[1];
  if (port === undefined || Number(port) < 1 || Number(port) > 65_535) {
    return err(WIFI_ADDRESS_ERROR);
  }
  return ok(address);
}

export function parsePairingCode(value: unknown): Result<string> {
  if (typeof value !== 'string' || !/^\d{6}$/.test(value.trim())) {
    return err('El código de vinculación tiene 6 dígitos.');
  }
  return ok(value.trim());
}

/** Wireless adb ids are `host:port`; USB serials and emulators never contain a port. */
export function isWifiDeviceId(deviceId: string): boolean {
  return WIFI_ADDRESS_PATTERN.test(deviceId);
}
