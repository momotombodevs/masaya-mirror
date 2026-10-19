import { nativeTheme, systemPreferences, type BrowserWindow } from 'electron';

/** Window background shown before the renderer paints, matching the OS appearance. */
export function getWindowBackground(): string {
  return nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f6f6f6';
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
