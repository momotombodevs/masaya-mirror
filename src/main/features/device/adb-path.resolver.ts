import { constants } from 'node:fs';
import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { log } from '../../logging/log';

const ADB_EXECUTABLE = process.platform === 'win32' ? 'adb.exe' : 'adb';

/** Directories that commonly hold `adb` but are missing from a GUI app's PATH. */
const SYSTEM_BIN_DIRS: Readonly<Record<string, readonly string[]>> = {
  darwin: ['/opt/homebrew/bin', '/usr/local/bin'],
  win32: ['C:\\platform-tools'],
  linux: ['/usr/local/bin', '/usr/bin'],
};

function androidSdkRoots(): readonly string[] {
  const home = homedir();
  const roots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(home, 'Library', 'Android', 'sdk'),
    path.join(home, 'Android', 'Sdk'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
  ];
  return roots.filter((root): root is string => Boolean(root));
}

function platformToolsDirs(): readonly string[] {
  return androidSdkRoots().map((root) => path.join(root, 'platform-tools'));
}

function systemBinDirs(): readonly string[] {
  return SYSTEM_BIN_DIRS[process.platform] ?? SYSTEM_BIN_DIRS.linux ?? [];
}

/** `ADB_PATH` may point at the executable, its folder, or an SDK root. */
function toAdbExecutable(candidate: string): string {
  if (path.basename(candidate) === ADB_EXECUTABLE) {
    return candidate;
  }
  return path.basename(candidate) === 'platform-tools'
    ? path.join(candidate, ADB_EXECUTABLE)
    : path.join(candidate, 'platform-tools', ADB_EXECUTABLE);
}

function buildCandidatePaths(customPath?: string | null): readonly string[] {
  const fromCustom = customPath ? [customPath] : [];
  const fromAdbPath = process.env.ADB_PATH ? [toAdbExecutable(process.env.ADB_PATH)] : [];
  const searchDirs = [
    ...platformToolsDirs(),
    ...(process.env.PATH ?? '').split(path.delimiter),
    ...systemBinDirs(),
  ].filter(Boolean);

  return [
    ...new Set([
      ...fromCustom,
      ...fromAdbPath,
      ...searchDirs.map((dir) => path.join(dir, ADB_EXECUTABLE)),
    ]),
  ];
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** What the last lookup found, so a lookup repeated every few seconds logs only changes. */
let lastLoggedOutcome: string | undefined;

function logOutcome(found: string | null, checked: number, customPath?: string | null): void {
  const source = found === null ? '' : found === customPath ? ' (chosen in the app)' : '';
  const outcome =
    found === null ? `adb not found in ${checked} locations` : `adb found: ${found}${source}`;
  if (outcome !== lastLoggedOutcome) {
    lastLoggedOutcome = outcome;
    (found === null ? log.warn : log.info)('adb', outcome);
  }
}

/** `customPath` (chosen by the user in the app) wins over `ADB_PATH` and the usual locations. */
export async function resolveAdbPath(customPath?: string | null): Promise<string | null> {
  const candidates = buildCandidatePaths(customPath);
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      logOutcome(candidate, candidates.length, customPath);
      return candidate;
    }
  }
  logOutcome(null, candidates.length, customPath);
  return null;
}

/** Electron apps often miss shell PATH entries; prepend common SDK and tool locations. */
export function augmentProcessPath(): void {
  const current = (process.env.PATH ?? '').split(path.delimiter);
  const merged = [...new Set([...platformToolsDirs(), ...systemBinDirs(), ...current])];
  process.env.PATH = merged.filter(Boolean).join(path.delimiter);
}
