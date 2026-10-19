import {
  nativeTheme,
  systemPreferences,
  type BrowserWindow,
  type BrowserWindowConstructorOptions,
} from 'electron';
import os from 'node:os';

/** Window background shown before the renderer paints, matching the OS appearance. */
export function getWindowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f6f6f6';
}

/** Windows 11 22H2 (build 22621) is the first release that draws a system backdrop material. */
const MICA_MIN_BUILD = 22621;

/** `os.release()` on Windows reads "10.0.<build>". */
export function isMicaSupported(release: string): boolean {
  const [major = 0, , build = 0] = release.split('.').map(Number);
  return major >= 10 && build >= MICA_MIN_BUILD;
}

type WindowMaterial = Pick<BrowserWindowConstructorOptions, 'vibrancy' | 'backgroundMaterial'>;

/** The system material behind the page: vibrancy on macOS, Mica on Windows 11. Null elsewhere. */
export function getWindowMaterial(
  platform: NodeJS.Platform = process.platform,
  release: string = os.release(),
): WindowMaterial | null {
  if (platform === 'darwin') {
    return { vibrancy: 'under-window' };
  }
  if (platform === 'win32' && isMicaSupported(release)) {
    return { backgroundMaterial: 'mica' };
  }
  return null;
}

/**
 * Keeps the color behind the page matching the OS appearance when no material draws it, since the
 * page itself is transparent and the theme can change while the app runs.
 */
export function keepWindowBackgroundInSync(window: BrowserWindow): void {
  const update = (): void => window.setBackgroundColor(getWindowBackground());
  nativeTheme.on('updated', update);
  window.once('closed', () => nativeTheme.off('updated', update));
}

/** Converts the OS accent color (RRGGBBAA) to the space-separated channels the theme expects. */
function getSystemAccentChannels(): string | null {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return null;
  }
  const hex = systemPreferences.getAccentColor();
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) {
    return null;
  }
  return [0, 2, 4].map((start) => parseInt(hex.slice(start, start + 2), 16)).join(' ');
}

/** Injects the OS accent color as the `--accent` theme variable every time the page loads. */
export function applySystemAccent(window: BrowserWindow): void {
  window.webContents.on('did-finish-load', () => {
    const channels = getSystemAccentChannels();
    if (channels) {
      void window.webContents.insertCSS(`:root { --accent: ${channels}; }`);
    }
  });
}
