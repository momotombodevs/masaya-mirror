import { app, type WebContents } from 'electron';
import { initLogFile, log } from '../../logging/log';
import { formatRuntime } from './diagnostic-report';
import { getRuntimeInfo } from './runtime-info';

function describeWindow(webContents: WebContents): string {
  return webContents.isDestroyed() ? 'a closed window' : webContents.getURL();
}

/**
 * Opens the log file and records what a bug report needs even when nobody saw it happen:
 * versions at startup, main-process exceptions, and renderer or GPU processes that died.
 */
export function startDiagnosticLogging(): void {
  initLogFile(app.getPath('logs'));
  log.info('app', `started: ${formatRuntime(getRuntimeInfo())}`);

  // The monitor only observes: Electron still shows its own error dialog as before.
  process.on('uncaughtExceptionMonitor', (error, origin) =>
    log.error('process', `uncaught exception (${origin})`, error),
  );
  process.on('unhandledRejection', (reason) =>
    log.error('process', 'unhandled promise rejection', reason),
  );

  app.on('render-process-gone', (_event, webContents, details) => {
    const message = `renderer gone: ${details.reason}, exit code ${details.exitCode}, ${describeWindow(webContents)}`;
    if (details.reason === 'clean-exit') {
      log.info('window', message);
    } else {
      log.error('window', message);
    }
  });
  app.on('child-process-gone', (_event, details) => {
    const name = details.name ? ` (${details.name})` : '';
    const message = `${details.type} process gone${name}: ${details.reason}, exit code ${details.exitCode}`;
    if (details.reason === 'clean-exit') {
      log.info('process', message);
    } else {
      log.error('process', message);
    }
  });
  app.on('will-quit', () => log.info('app', 'quitting'));
}
