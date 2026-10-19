import { defineConfig } from '@playwright/test';

/** End-to-end tests drive the built Electron app against a fake adb. Run `pnpm test:e2e`. */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  // One Electron app at a time: the app holds a single-instance lock.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
});
