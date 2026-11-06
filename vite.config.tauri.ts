import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';

/**
 * index.html carries its own CSP meta tag, and it is enforced next to the one in tauri.conf.json.
 * Tauri's IPC goes through `ipc:` (and `http://ipc.localhost` on Windows), so the page must allow
 * it. The dev server also needs inline scripts (React Fast Refresh) and its HMR websocket.
 */
function tauriCsp(isDev: boolean): Plugin {
  return {
    name: 'masaya-tauri-csp',
    transformIndexHtml(html) {
      const connect = isDev
        ? "connect-src 'self' ipc: http://ipc.localhost ws://127.0.0.1:5173"
        : "connect-src 'self' ipc: http://ipc.localhost";
      let next = html.replace("connect-src 'self'", connect);
      if (isDev) {
        next = next.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
      }
      return next;
    },
  };
}

// The renderer for the Tauri build: the same React app, without the Electron plugins.
export default defineConfig(({ command }) => ({
  clearScreen: false,
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  optimizeDeps: {
    include: [
      '@yume-chan/scrcpy-decoder-webcodecs',
      '@yume-chan/scrcpy',
      '@yume-chan/stream-extra',
    ],
  },
  plugins: [react(), tauriCsp(command === 'serve')],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    outDir: 'dist-tauri',
    emptyOutDir: true,
    // WebView2 on Windows is current Chromium; WebKit on macOS/Linux is the floor.
    target: ['chrome110', 'safari16'],
  },
}));
