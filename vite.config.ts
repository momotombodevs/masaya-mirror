/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import path from 'node:path';
import electron from 'vite-plugin-electron/simple';
import react from '@vitejs/plugin-react';

export default defineConfig({
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
  plugins: [
    react(),
    electron({
      main: {
        entry: {
          main: path.join(__dirname, 'src/main/index.ts'),
        },
        vite: {
          build: {
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
      preload: {
        input: {
          preload: path.join(__dirname, 'src/preload/index.ts'),
        },
        vite: {
          build: {
            rollupOptions: {
              external: ['electron'],
              output: {
                format: 'cjs',
                entryFileNames: 'preload.cjs',
                inlineDynamicImports: true,
              },
            },
          },
        },
      },
      renderer: process.env.NODE_ENV === 'test' ? undefined : {},
    }),
  ],
  test: {
    environment: 'node',
    // Hook and component tests opt in to jsdom with `// @vitest-environment jsdom`.
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
