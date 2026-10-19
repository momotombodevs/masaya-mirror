import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import { DEV_ICON, MAIN_DIST, RENDERER_DIST, VITE_DEV_SERVER_URL } from './paths';
import {
  applySystemAccent,
  getWindowBackground,
  getWindowMaterial,
  keepWindowBackgroundInSync,
} from './system-theme';
import { attachWindowSecurity, registerDevContentSecurityPolicy } from './window-security';

const APP_NAME = 'Manolo Mirror';

app.setName(APP_NAME);
if (process.platform === 'win32') {
  app.setAppUserModelId('com.manolo.mirror');
}

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
    },
  });
  attachWindowSecurity(window);
  applySystemAccent(window);
  return window;
}

export function createWindow(): BrowserWindow {
  const material = getWindowMaterial();
  const mainWindow = createSecureWindow({
    width: 720,
    height: 560,
    minWidth: 480,
    minHeight: 360,
    title: APP_NAME,
    // The page is transparent: a material shows through it, otherwise this color does.
    backgroundColor: material ? '#00000000' : getWindowBackground(),
    ...material,
  });
  if (!material) {
    keepWindowBackgroundInSync(mainWindow);
  }

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  // DevTools only with `pnpm dev:debug` (MANOLO_OPEN_DEVTOOLS=1).
  if (VITE_DEV_SERVER_URL && process.env.MANOLO_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return mainWindow;
}

/**
 * A second instance would fight the first over the adb server and mirror sessions, so it
 * hands over to the running one. Returns false when this process should quit.
 */
export function claimSingleInstance(): boolean {
  if (!app.requestSingleInstanceLock()) {
    return false;
  }

  app.on('second-instance', () => {
    const [window] = BrowserWindow.getAllWindows();
    if (window?.isMinimized()) {
      window.restore();
    }
    window?.focus();
  });
  return true;
}

export function registerAppLifecycle(): void {
  void app.whenReady().then(() => {
    registerDevContentSecurityPolicy();
    if (!app.isPackaged) {
      app.dock?.setIcon(DEV_ICON);
    }
    if (process.platform === 'darwin') {
      app.setAboutPanelOptions({
        applicationName: APP_NAME,
        applicationVersion: app.getVersion(),
        version: app.getVersion(),
        copyright: `© ${APP_NAME}`,
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
