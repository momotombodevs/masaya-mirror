import { session, type BrowserWindow } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RENDERER_DIST, VITE_DEV_SERVER_URL } from './paths';

function isAllowedNavigation(url: string): boolean {
  if (url.startsWith('file://')) {
    const appIndexUrl = pathToFileURL(path.join(RENDERER_DIST, 'index.html')).toString();
    return (
      url === appIndexUrl || url.startsWith(`${appIndexUrl}?`) || url.startsWith(`${appIndexUrl}#`)
    );
  }

  if (!VITE_DEV_SERVER_URL) {
    return false;
  }
  const { origin } = new URL(VITE_DEV_SERVER_URL);
  return url === origin || url.startsWith(`${origin}/`);
}

/** Windows may only show the app itself: no pop-ups, no navigating or redirecting away. */
export function attachWindowSecurity(window: BrowserWindow): void {
  const { webContents } = window;
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const blockForeignNavigation = (event: { preventDefault: () => void }, url: string): void => {
    if (!isAllowedNavigation(url)) {
      event.preventDefault();
    }
  };
  webContents.on('will-navigate', blockForeignNavigation);
  webContents.on('will-redirect', blockForeignNavigation);
}

/**
 * Packaged builds load `index.html` from disk and get their Content-Security-Policy from the
 * meta tag in that file. The dev server also needs inline scripts and a websocket for HMR, so
 * in development the policy is sent as a header instead.
 */
export function registerDevContentSecurityPolicy(): void {
  if (!VITE_DEV_SERVER_URL) {
    return;
  }

  const devUrl = new URL(VITE_DEV_SERVER_URL);
  const websocketOrigin = `${devUrl.protocol === 'https:' ? 'wss:' : 'ws:'}//${devUrl.host}`;
  const policy = [
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

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        ...(isAllowedNavigation(details.url) ? { 'Content-Security-Policy': [policy] } : {}),
      },
    });
  });
}
