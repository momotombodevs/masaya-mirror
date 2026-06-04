import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';

const SERVER_FILENAME = 'scrcpy-server.jar';

function getDevServerPath(): string {
  const appRoot = process.env.APP_ROOT ?? path.join(process.cwd());
  return path.join(appRoot, 'resources', 'scrcpy-server', SERVER_FILENAME);
}

function getPackagedServerPath(): string | null {
  if (!process.resourcesPath) {
    return null;
  }
  return path.join(process.resourcesPath, 'scrcpy-server', SERVER_FILENAME);
}

async function isReadable(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveScrcpyServerPath(): Promise<string | null> {
  const packaged = getPackagedServerPath();
  const candidates = [
    process.env.SCRCPY_SERVER_PATH,
    getDevServerPath(),
    packaged,
  ].filter((value): value is string => typeof value === 'string' && value.length > 0);

  for (const candidate of candidates) {
    if (await isReadable(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function getExpectedScrcpyServerPath(): string {
  return getDevServerPath();
}
