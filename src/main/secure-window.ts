import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import { DEV_ICON, MAIN_DIST } from './paths';
import { applySystemAccent } from './system-theme';
import { attachWindowSecurity } from './window-security';

/** Every window runs sandboxed with context isolation and only the preload bridge. */
export function createSecureWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
  const window = new BrowserWindow({
    // Windows and Linux show this in dev; packaged builds use the icon embedded by the packager.
    ...(app.isPackaged ? {} : { icon: DEV_ICON }),
    ...options,
    webPreferences: {
      preload: path.join(MAIN_DIST, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      // Device audio starts with the stream, not with a click in the window.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  attachWindowSecurity(window);
  applySystemAccent(window);
  return window;
}
