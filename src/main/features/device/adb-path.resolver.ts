import { access } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { constants } from 'node:fs';

const ADB_EXECUTABLE = process.platform === 'win32' ? 'adb.exe' : 'adb';

function sdkPlatformToolsDir(sdkRoot: string): string {
  return path.join(sdkRoot, 'platform-tools');
}

function toAdbExecutable(candidate: string): string {
  const base = path.basename(candidate);
  if (base === ADB_EXECUTABLE) {
    return candidate;
  }
  if (
    candidate.endsWith(`${path.sep}platform-tools`) ||
    candidate.endsWith('platform-tools')
  ) {
    return path.join(candidate, ADB_EXECUTABLE);
  }
  return path.join(sdkPlatformToolsDir(candidate), ADB_EXECUTABLE);
}

function buildCandidatePaths(): readonly string[] {
  const home = homedir();
  const sdkRoots = [
    process.env.ADB_PATH,
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(home, 'Library', 'Android', 'sdk'),
    path.join(home, 'Android', 'Sdk'),
    process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk')
      : undefined,
    process.env.USERPROFILE
      ? path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Android', 'Sdk')
      : undefined,
  ].filter((value): value is string => Boolean(value));

  const fromSdkRoots = sdkRoots.map(toAdbExecutable);

  const pathDirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  const fromPath = pathDirs.map((dir) => path.join(dir, ADB_EXECUTABLE));

  const fixedPaths =
    process.platform === 'darwin'
      ? [
          '/opt/homebrew/bin/adb',
          '/usr/local/bin/adb',
          path.join(home, 'Library', 'Android', 'sdk', 'platform-tools', ADB_EXECUTABLE),
        ]
      : process.platform === 'win32'
        ? [
            'C:\\platform-tools\\adb.exe',
            path.join(process.env.ProgramFiles ?? '', 'Android', 'android-sdk', 'platform-tools', ADB_EXECUTABLE),
          ]
        : ['/usr/local/bin/adb', '/usr/bin/adb', path.join(home, 'Android', 'Sdk', 'platform-tools', ADB_EXECUTABLE)];

  return [...new Set([...fromSdkRoots, ...fromPath, ...fixedPaths])];
}

async function isExecutable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveAdbPath(): Promise<string | null> {
  for (const candidate of buildCandidatePaths()) {
    if (await isExecutable(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Electron apps often miss shell PATH entries; prepend common SDK/tool locations. */
export function augmentProcessPath(): void {
  const extraDirs = [
    process.env.ANDROID_HOME ? sdkPlatformToolsDir(process.env.ANDROID_HOME) : undefined,
    process.env.ANDROID_SDK_ROOT ? sdkPlatformToolsDir(process.env.ANDROID_SDK_ROOT) : undefined,
    path.join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools'),
    path.join(homedir(), 'Android', 'Sdk', 'platform-tools'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ].filter((value): value is string => Boolean(value));

  const current = process.env.PATH ?? '';
  const merged = [...new Set([...extraDirs, ...current.split(path.delimiter)])]
    .filter(Boolean)
    .join(path.delimiter);

  process.env.PATH = merged;
}
