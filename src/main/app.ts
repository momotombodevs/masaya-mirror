import { app, BrowserWindow, session, type BrowserWindowConstructorOptions } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, '..');

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST;

app.setName('Manolo Mirror');
if (process.platform === 'win32') {
  app.setAppUserModelId('com.manolo.mirror');
}

export let mainWindow: BrowserWindow | null = null;
let securityHeadersRegistered = false;

function getAllowedRendererOrigins(): readonly string[] {
  if (!VITE_DEV_SERVER_URL) {
    return [];
  }

  return [new URL(VITE_DEV_SERVER_URL).origin];
}

function isAllowedNavigation(url: string): boolean {
  if (url.startsWith('file://')) {
    const appIndexUrl = pathToFileURL(path.join(RENDERER_DIST, 'index.html')).toString();
    return url === appIndexUrl || url.startsWith(`${appIndexUrl}?`) || url.startsWith(`${appIndexUrl}#`);
  }

  return getAllowedRendererOrigins().some((origin) => url === origin || url.startsWith(`${origin}/`));
}

function getContentSecurityPolicy(): string {
  if (VITE_DEV_SERVER_URL) {
    const devUrl = new URL(VITE_DEV_SERVER_URL);
    const websocketOrigin = `${devUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${devUrl.host}`;

    return [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' ${devUrl.origin}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src 'self' ${devUrl.origin} ${websocketOrigin}`,
      "media-src 'self' blob:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
    ].join('; ');
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "media-src 'self' blob:",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function registerSecurityHeaders(): void {
  if (!VITE_DEV_SERVER_URL || securityHeadersRegistered) {
    return;
  }

  securityHeadersRegistered = true;
  const contentSecurityPolicy = getContentSecurityPolicy();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!isAllowedNavigation(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [contentSecurityPolicy],
      },
    });
  });
}

function attachWindowSecurity(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });
  window.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  });
}

export function createSecureWindow(options: BrowserWindowConstructorOptions): BrowserWindow {
  const window = new BrowserWindow(options);
  attachWindowSecurity(window);
  return window;
}

export function createWindow(): BrowserWindow {
  mainWindow = createSecureWindow({
    width: 960,
    height: 640,
    title: 'Manolo Mirror',
    icon: path.join(process.env.VITE_PUBLIC ?? RENDERER_DIST, 'manolo-logo.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  if (VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(path.join(RENDERER_DIST, 'index.html'));
  }

  // DevTools only with `pnpm dev:debug` (MANOLO_OPEN_DEVTOOLS=1). Autofill console noise is from DevTools.
  if (VITE_DEV_SERVER_URL && process.env.MANOLO_OPEN_DEVTOOLS === '1') {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  return mainWindow;
}

export function registerAppLifecycle(): void {
  void app.whenReady().then(() => {
    registerSecurityHeaders();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
      mainWindow = null;
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}
