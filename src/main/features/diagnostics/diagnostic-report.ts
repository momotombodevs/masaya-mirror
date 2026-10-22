import type { AndroidDevice } from '../../../shared/device/types';
import type { Result } from '../../../shared/ipc/result';

/** Log lines a diagnostic report ends with: enough for the minutes before a problem. */
export const REPORT_LOG_LINES = 200;

export type RuntimeInfo = {
  readonly appVersion: string;
  /** False when running from source (`pnpm dev`). */
  readonly packaged: boolean;
  readonly electron: string;
  readonly chrome: string;
  readonly node: string;
  readonly platform: string;
  /** The OS release people know (macOS 15.1, Windows 10.0.26100), not the kernel's. */
  readonly osVersion: string;
  readonly arch: string;
};

export type DiagnosticInput = {
  readonly generatedAt: Date;
  readonly runtime: RuntimeInfo;
  readonly locale: string;
  /** Home folder already shortened to `~`. Null when adb could not be found. */
  readonly adbPath: string | null;
  readonly adbVersion: Result<string>;
  readonly devices: Result<readonly AndroidDevice[]>;
  readonly eventCounts: readonly (readonly [kind: string, count: number])[];
  readonly logLines: readonly string[];
};

/** `Masaya 0.3.1 · Electron 42.1.0 · Chrome 138.0 · Node 22.1.0 · darwin 15.1 arm64` */
export function formatRuntime(runtime: RuntimeInfo): string {
  const build = runtime.packaged ? '' : ' (development)';
  return [
    `Masaya ${runtime.appVersion}${build}`,
    `Electron ${runtime.electron}`,
    `Chrome ${runtime.chrome}`,
    `Node ${runtime.node}`,
    `${runtime.platform} ${runtime.osVersion} ${runtime.arch}`,
  ].join(' · ');
}

/**
 * `adb version` prints the protocol version, the platform-tools release, then where it is
 * installed and the host OS, which the report already has. Keeps the two version lines.
 */
export function summarizeAdbVersion(stdout: string): string {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /version/i.test(line))
    .slice(0, 2)
    .join(', ');
}

function formatDevice(device: AndroidDevice): string {
  const name = device.displayName ?? device.model ?? 'unknown model';
  const model = device.displayName && device.model ? ` (${device.model})` : '';
  return `  - ${name}${model} · ${device.id} · ${device.status}`;
}

function section(title: string, lines: readonly string[], empty: string): readonly string[] {
  return ['', title, ...(lines.length > 0 ? lines : [`  ${empty}`])];
}

/** Plain text meant to be pasted into a bug report: versions, devices, then the recent log. */
export function buildDiagnosticReport(input: DiagnosticInput): string {
  const adbVersion = input.adbVersion.ok
    ? input.adbVersion.value
    : `unknown (${input.adbVersion.error})`;
  const devices = input.devices.ok
    ? input.devices.value.map(formatDevice)
    : [`  could not list devices: ${input.devices.error}`];

  return [
    'Masaya diagnostic report',
    `Generated: ${input.generatedAt.toISOString()}`,
    formatRuntime(input.runtime),
    `Language: ${input.locale}`,
    `adb: ${input.adbPath ?? 'not found'}`,
    `adb version: ${adbVersion}`,
    ...section('Devices:', devices, 'none'),
    ...section(
      'Repeated events:',
      input.eventCounts.map(([kind, count]) => `  ${kind} ×${count}`),
      'none',
    ),
    ...section(`Log (last ${REPORT_LOG_LINES} lines):`, input.logLines, 'empty'),
  ].join('\n');
}
