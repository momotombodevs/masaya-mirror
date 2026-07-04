import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const openDevtools = args.includes('--debug');
const viteArgs = args.filter((arg) => arg !== '--debug');
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteEntrypoint = path.join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');

const childEnv = {
  ...process.env,
};

delete childEnv.ELECTRON_RUN_AS_NODE;

if (openDevtools) {
  childEnv.MANOLO_OPEN_DEVTOOLS = '1';
}

const child = spawn(process.execPath, [viteEntrypoint, ...viteArgs], {
  stdio: 'inherit',
  env: childEnv,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
