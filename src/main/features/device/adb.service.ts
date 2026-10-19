import type { AndroidDevice, DeviceStatus } from '../../../shared/device/types';
import { err, ok, type Result } from '../../../shared/ipc/result';
import { runCommand } from '../../utils/runCommand';
import { ADB_NOT_FOUND_MESSAGE, mapCommandError } from './adb-error';
import { resolveAdbPath } from './adb-path.resolver';

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

const INSTALL_TIMEOUT_MS = 180_000;
const NETWORK_TIMEOUT_MS = 20_000;

/** adb reports most connection failures on stdout with exit code 0. */
const WIFI_FAILURE_PATTERN = /failed|cannot|unable|refused|error|no route|timed out/i;

/** Last non-empty line, which is where adb puts its verdict. */
function lastLine(text: string): string {
  return text.trim().split('\n').pop()?.trim() ?? '';
}

export class AdbService {
  private adbPath: string | null = null;
  private customPath: string | null = null;

  /** Sets (or clears) the `adb` the user picked in the app and forgets the cached lookup. */
  setCustomPath(customPath: string | null): void {
    this.customPath = customPath;
    this.adbPath = null;
  }

  async getExecutablePath(): Promise<string | null> {
    if (this.adbPath) {
      return this.adbPath;
    }
    this.adbPath = await resolveAdbPath(this.customPath);
    return this.adbPath;
  }

  /** Runs `adb version` on a candidate executable to be sure it really is adb. */
  async verifyExecutable(candidate: string): Promise<boolean> {
    try {
      const { stdout } = await runCommand(candidate, ['version'], 5_000);
      return /Android Debug Bridge/i.test(stdout);
    } catch {
      return false;
    }
  }

  private async run(
    args: readonly string[],
    timeoutMs = NETWORK_TIMEOUT_MS,
  ): Promise<Result<string>> {
    const adbPath = await this.getExecutablePath();
    if (!adbPath) {
      return err(ADB_NOT_FOUND_MESSAGE);
    }
    try {
      const { stdout, stderr } = await runCommand(adbPath, args, timeoutMs);
      return ok(`${stdout}\n${stderr}`.trim());
    } catch (error: unknown) {
      return err(mapCommandError(error));
    }
  }

  async pair(address: string, code: string): Promise<Result<string>> {
    const result = await this.run(['pair', address, code]);
    if (!result.ok) {
      return result;
    }
    return /successfully paired/i.test(result.value)
      ? ok('Dispositivo vinculado.')
      : err(lastLine(result.value) || 'No se pudo vincular. Revisa la dirección y el código.');
  }

  async connect(address: string): Promise<Result<string>> {
    const result = await this.run(['connect', address]);
    if (!result.ok) {
      return result;
    }
    const verdict = lastLine(result.value);
    return /^(already )?connected/i.test(verdict) && !WIFI_FAILURE_PATTERN.test(verdict)
      ? ok(`Conectado a ${address}.`)
      : err(verdict || 'No se pudo conectar.');
  }

  async disconnect(address: string): Promise<Result<string>> {
    const result = await this.run(['disconnect', address]);
    return result.ok ? ok(`Desconectado de ${address}.`) : result;
  }

  async installApk(deviceId: string, apkPath: string): Promise<Result<void>> {
    const result = await this.run(
      ['-s', deviceId, 'install', '-r', '-t', apkPath],
      INSTALL_TIMEOUT_MS,
    );
    if (!result.ok) {
      return result;
    }
    return /^Success/m.test(result.value)
      ? ok(undefined)
      : err(lastLine(result.value) || 'No se pudo instalar el APK.');
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
      return err(mapCommandError(error));
    }
  }
}
