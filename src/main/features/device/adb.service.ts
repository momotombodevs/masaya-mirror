import type {
  AndroidDevice,
  DeviceSettingKey,
  DeviceSettings,
  DeviceStatus,
} from '../../../shared/device/types';
import { err, mapResult, ok, type Result } from '../../../shared/ipc/result';
import { runCommand } from '../../utils/runCommand';
import { mt } from '../../i18n';
import { adbNotFound, commandFailure } from './adb-error';
import { resolveAdbPath } from './adb-path.resolver';
import { DEVICE_NAME_SHELL_COMMAND, friendlyModelName, parseDeviceName } from './device-name';

/**
 * Every state `adb devices` can print. Anything else on a line (daemon chatter, warnings) is
 * not a device. `no permissions` is followed by a reason in parentheses.
 */
const DEVICE_LINE_PATTERN =
  /^(\S+)\s+(device|offline|unauthorized|authorizing|connecting|recovery|sideload|rescue|bootloader|host|no permissions)(?:\s+(.*))?$/;

function parseDeviceStatus(raw: string): DeviceStatus {
  switch (raw) {
    case 'device':
    case 'offline':
    case 'unauthorized':
      return raw;
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
  const devices: AndroidDevice[] = [];

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    // "* daemon started successfully" and the like are adb talking about itself.
    if (trimmed.startsWith('*')) {
      continue;
    }
    const [, id, statusRaw, rest = ''] = DEVICE_LINE_PATTERN.exec(trimmed) ?? [];
    if (!id || !statusRaw) {
      continue;
    }

    let model: string | undefined;
    let product: string | undefined;

    for (const token of rest.split(/\s+/)) {
      const parsed = parseKeyValueToken(token);
      if (parsed?.key === 'model') {
        model = parsed.value;
      } else if (parsed?.key === 'product') {
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
const DEVICE_NAME_TIMEOUT_MS = 5_000;

/** Last non-empty line, which is where adb puts its verdict. */
function lastLine(text: string): string {
  return text.trim().split('\n').pop()?.trim() ?? '';
}

/** A service adb found on the local network through mDNS. */
export type MdnsService = {
  readonly name: string;
  /** `pairing` is the phone showing the QR/code screen; `connect` is a phone ready to connect. */
  readonly kind: 'pairing' | 'connect';
  readonly address: string;
};

const MDNS_LINE_PATTERN = /^(\S+)\s+_adb-tls-(pairing|connect)\._tcp\.?\s+(\S+:\d+)\s*$/;

/** Parses `adb mdns services`, keeping only wireless-debugging entries with an IPv4/host address. */
export function parseMdnsServices(stdout: string): readonly MdnsService[] {
  const services: MdnsService[] = [];
  for (const line of stdout.split('\n')) {
    const match = MDNS_LINE_PATTERN.exec(line.trim());
    const [, name, kind, address] = match ?? [];
    if (name && address && (kind === 'pairing' || kind === 'connect') && !address.startsWith('[')) {
      services.push({ name, kind, address });
    }
  }
  return services;
}

export class AdbService {
  private adbPath: string | null = null;
  private customPath: string | null = null;
  /**
   * Marketing names by device id. The list refreshes every 5 s, so each phone is asked once per
   * connection; failed lookups are dropped and retried on the next refresh.
   */
  private readonly deviceNames = new Map<string, Promise<string | undefined>>();

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
      return adbNotFound();
    }
    try {
      const { stdout, stderr } = await runCommand(adbPath, args, timeoutMs);
      return ok(`${stdout}\n${stderr}`.trim());
    } catch (error: unknown) {
      return commandFailure(error);
    }
  }

  /** mDNS lets adb find phones without typing an address. Some adb builds or networks lack it. */
  async checkMdns(): Promise<Result<void>> {
    const result = await this.run(['mdns', 'check']);
    if (!result.ok) {
      return result;
    }
    return /mdns daemon version/i.test(result.value) && !/unavailable|error/i.test(result.value)
      ? ok(undefined)
      : err(mt('main.mdnsUnsupported'));
  }

  async listMdnsServices(): Promise<Result<readonly MdnsService[]>> {
    return mapResult(await this.run(['mdns', 'services']), parseMdnsServices);
  }

  async pair(address: string, code: string): Promise<Result<string>> {
    const result = await this.run(['pair', address, code]);
    if (!result.ok) {
      return result;
    }
    return /successfully paired/i.test(result.value)
      ? ok(mt('main.paired'))
      : err(lastLine(result.value) || mt('main.pairFailed'));
  }

  async connect(address: string): Promise<Result<string>> {
    const result = await this.run(['connect', address]);
    if (!result.ok) {
      return result;
    }
    const verdict = lastLine(result.value);
    return /^(already )?connected/i.test(verdict)
      ? ok(mt('main.connectedTo', { address }))
      : err(verdict || mt('main.connectFailed'));
  }

  async disconnect(address: string): Promise<Result<string>> {
    const result = await this.run(['disconnect', address]);
    return mapResult(result, () => mt('main.disconnectedFrom', { address }));
  }

  /** Reads the developer options the settings screen shows. Both are plain `settings get` calls. */
  async getDeviceSettings(deviceId: string): Promise<Result<DeviceSettings>> {
    const get = (table: string, name: string): Promise<Result<string>> =>
      this.run(['-s', deviceId, 'shell', 'settings', 'get', table, name]);
    const [touches, awake] = await Promise.all([
      get('system', 'show_touches'),
      get('global', 'stay_on_while_plugged_in'),
    ]);
    if (!touches.ok) {
      return touches;
    }
    if (!awake.ok) {
      return awake;
    }
    return ok({
      showTouches: touches.value.trim() === '1',
      // 0 is off; any other bitmask (USB, AC, wireless) keeps the screen on while charging.
      stayAwake: !['', '0', 'null'].includes(awake.value.trim()),
    });
  }

  async setDeviceSetting(
    deviceId: string,
    key: DeviceSettingKey,
    enabled: boolean,
  ): Promise<Result<void>> {
    const [table, name, on] =
      key === 'showTouches'
        ? (['system', 'show_touches', '1'] as const)
        : (['global', 'stay_on_while_plugged_in', '7'] as const);
    const result = await this.run([
      '-s',
      deviceId,
      'shell',
      'settings',
      'put',
      table,
      name,
      enabled ? on : '0',
    ]);
    return mapResult(result, () => undefined);
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
      : err(lastLine(result.value) || mt('main.installFailed'));
  }

  async listDevices(): Promise<Result<readonly AndroidDevice[]>> {
    const result = mapResult(await this.run(['devices', '-l']), parseAdbDevicesOutput);
    if (!result.ok) {
      return result;
    }
    const devices = result.value;
    const listedIds = new Set(devices.map((device) => device.id));
    for (const id of this.deviceNames.keys()) {
      if (!listedIds.has(id)) {
        this.deviceNames.delete(id);
      }
    }
    const names = await Promise.all(devices.map((device) => this.lookUpDeviceName(device)));
    return ok(
      devices.map((device, index) => {
        const displayName =
          names[index] ??
          (device.model !== undefined ? friendlyModelName(device.model) : undefined);
        return displayName ? { ...device, displayName } : device;
      }),
    );
  }

  /** Reads the phone's marketing name once; only a phone that is online can answer. */
  private lookUpDeviceName(device: AndroidDevice): Promise<string | undefined> {
    const cached = this.deviceNames.get(device.id);
    if (cached || device.status !== 'device') {
      return cached ?? Promise.resolve(undefined);
    }
    const lookup = this.run(
      ['-s', device.id, 'shell', DEVICE_NAME_SHELL_COMMAND],
      DEVICE_NAME_TIMEOUT_MS,
    )
      .catch((error: unknown) => err(String(error)))
      .then((result) => {
        if (result.ok) {
          return parseDeviceName(result.value);
        }
        // A phone that has just come online may not answer yet; ask again on the next refresh.
        if (this.deviceNames.get(device.id) === lookup) {
          this.deviceNames.delete(device.id);
        }
        return undefined;
      });
    this.deviceNames.set(device.id, lookup);
    return lookup;
  }
}
