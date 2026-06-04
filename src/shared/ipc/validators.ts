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
