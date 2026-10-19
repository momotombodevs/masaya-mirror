import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Project root in development, and the asar root once packaged. */
export const APP_ROOT = path.join(moduleDir, '..');

// The scrcpy-server resolver reads this to find `resources/` during development.
process.env.APP_ROOT = APP_ROOT;

export const MAIN_DIST = path.join(APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(APP_ROOT, 'dist');

/** Set by vite-plugin-electron while the dev server runs; undefined in packaged builds. */
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
