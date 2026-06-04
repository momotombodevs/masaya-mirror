import { access, copyFile, mkdir, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const SCRCPY_SERVER_VERSION = process.env.SCRCPY_SERVER_VERSION ?? '3.3.3';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_DIR = path.join(ROOT, 'resources', 'scrcpy-server');
const SERVER_FILE = path.join(SERVER_DIR, 'scrcpy-server.jar');
const FETCH_BIN = path.join(ROOT, 'node_modules', '@yume-chan', 'fetch-scrcpy-server', 'bin', 'fetch-server.js');
const FETCH_PKG_DIR = path.join(ROOT, 'node_modules', '@yume-chan', 'fetch-scrcpy-server');

async function exists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (await exists(SERVER_FILE)) {
    console.log(`scrcpy-server already present at ${SERVER_FILE}`);
    return;
  }

  await mkdir(SERVER_DIR, { recursive: true });

  console.log(`Downloading scrcpy-server v${SCRCPY_SERVER_VERSION}…`);
  await execFileAsync(process.execPath, [FETCH_BIN, SCRCPY_SERVER_VERSION], {
    cwd: FETCH_PKG_DIR,
  });

  const downloaded = path.join(FETCH_PKG_DIR, 'server.bin');
  if (!(await exists(downloaded))) {
    throw new Error(`Download failed: ${downloaded} not found`);
  }

  await copyFile(downloaded, SERVER_FILE);
  await rm(path.join(FETCH_PKG_DIR, 'server.bin'), { force: true });
  console.log(`scrcpy-server ready at ${SERVER_FILE}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to setup scrcpy-server: ${message}`);
  process.exit(1);
});
