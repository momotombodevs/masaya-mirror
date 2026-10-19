import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const FAKE_ADB = path.resolve(here, 'fake-adb', 'adb');

export type Launched = {
  readonly app: ElectronApplication;
  readonly window: Page;
  /** Folder that holds this run's settings and fake adb state. */
  readonly dataDir: string;
};

/** Starts the built app with an isolated user-data folder and, optionally, the fake adb. */
export async function launchApp(options: { readonly adbPath: string }): Promise<Launched> {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'manolo-e2e-'));
  const app = await electron.launch({
    // The CI sandbox cannot create the Chromium setuid sandbox.
    args: ['.', '--no-sandbox', `--user-data-dir=${path.join(dataDir, 'user-data')}`],
    cwd: path.resolve(here, '..'),
    env: {
      ...process.env,
      ADB_PATH: options.adbPath,
      FAKE_ADB_STATE: path.join(dataDir, 'fake-adb-state'),
      // Keep a real Android SDK on the machine from being picked up.
      ANDROID_HOME: '',
      ANDROID_SDK_ROOT: '',
      HOME: dataDir,
      PATH: '/usr/bin:/bin',
    },
  });
  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  return { app, window, dataDir };
}
