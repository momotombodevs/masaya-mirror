import type { AndroidDevice, DeviceStatus } from '../../../shared/device/types';
import { err, ok, type Result } from '../../../shared/ipc/result';
import { CommandError, runCommand } from '../../utils/runCommand';
import { resolveAdbPath } from './adb-path.resolver';

const ADB_NOT_FOUND_MESSAGE =
  'ADB no encontrado. Instala Android platform-tools (Android Studio → SDK Manager) o define ANDROID_HOME / ADB_PATH. En macOS suele estar en ~/Library/Android/sdk/platform-tools/adb.';

const DEVICE_LIST_HEADER = 'List of devices attached';

function parseDeviceStatus(raw: string): DeviceStatus {
  switch (raw) {
    case 'device':
      return 'device';
    case 'offline':
      return 'offline';
    case 'unauthorized':
      return 'unauthorized';
    default:
      return 'unknown';
  }
}

function parseKeyValueToken(token: string): { key: string; value: string } | null {
  const colonIndex = token.indexOf(':');
  if (colonIndex <= 0) {
    return null;
  }
  return {
    key: token.slice(0, colonIndex),
    value: token.slice(colonIndex + 1),
  };
}

export function parseAdbDevicesOutput(stdout: string): readonly AndroidDevice[] {
  const lines = stdout.split('\n');
  const devices: AndroidDevice[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === DEVICE_LIST_HEADER) {
      continue;
    }

    const parts = trimmed.split(/\s+/);
    const id = parts[0];
    const statusRaw = parts[1];

    if (!id || !statusRaw) {
      continue;
    }

    let model: string | undefined;
    let product: string | undefined;

    for (const token of parts.slice(2)) {
      const parsed = parseKeyValueToken(token);
      if (!parsed) {
        continue;
      }
      if (parsed.key === 'model') {
        model = parsed.value;
      } else if (parsed.key === 'product') {
        product = parsed.value;
      }
    }

    devices.push({
      id,
      status: parseDeviceStatus(statusRaw),
      ...(model !== undefined ? { model } : {}),
      ...(product !== undefined ? { product } : {}),
    });
  }

  return devices;
}

export class AdbService {
  private adbPath: string | null = null;

  async getExecutablePath(): Promise<string | null> {
    if (this.adbPath) {
      return this.adbPath;
    }
    this.adbPath = await resolveAdbPath();
    return this.adbPath;
  }

  async listDevices(): Promise<Result<readonly AndroidDevice[]>> {
    const adbPath = await this.getExecutablePath();
    if (!adbPath) {
      return err(ADB_NOT_FOUND_MESSAGE);
    }

    try {
      const { stdout } = await runCommand(adbPath, ['devices', '-l']);
      return ok(parseAdbDevicesOutput(stdout));
    } catch (error: unknown) {
      if (error instanceof CommandError) {
        if (error.code === 'ENOENT') {
          return err(ADB_NOT_FOUND_MESSAGE);
        }
        if (error.timedOut) {
          return err('ADB no respondió a tiempo. Comprueba que el servidor adb esté en ejecución.');
        }
        return err(error.message);
      }
      if (error instanceof Error) {
        return err(error.message);
      }
      return err('Error desconocido al ejecutar adb.');
    }
  }
}
