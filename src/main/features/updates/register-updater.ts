import { app, BrowserWindow, dialog, type MessageBoxOptions } from 'electron';
import electronUpdater from 'electron-updater';
import { mt } from '../../i18n';
import { UpdaterService, type UpdateNotice } from './updater.service';

/** Updates only make sense for an installed app; an AppImage is the one updatable Linux build. */
function canSelfUpdate(): boolean {
  return app.isPackaged && (process.platform !== 'linux' || Boolean(process.env.APPIMAGE));
}

function showMessage(options: MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  const window = BrowserWindow.getFocusedWindow();
  return window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options);
}

function describeNotice(notice: UpdateNotice): MessageBoxOptions {
  switch (notice.kind) {
    case 'upToDate':
      return {
        type: 'info',
        message: mt('update.upToDate'),
        detail: mt('update.upToDateDetail', { version: app.getVersion() }),
      };
    case 'available':
      return {
        type: 'info',
        message: mt('update.available', { version: notice.version }),
        detail: mt('update.availableDetail'),
      };
    case 'failed':
      return { type: 'error', message: mt('update.failed') };
  }
}

/** Returns null when this build cannot update itself (development, deb installs, and so on). */
export function createUpdaterService(): UpdaterService | null {
  if (!canSelfUpdate()) {
    return null;
  }
  return new UpdaterService({
    driver: electronUpdater.autoUpdater,
    notify: (notice) => void showMessage(describeNotice(notice)),
    confirmRestart: async (version) => {
      const { response } = await showMessage({
        type: 'info',
        message: mt('update.ready', { version }),
        detail: mt('update.readyDetail'),
        buttons: [mt('update.restart'), mt('update.later')],
        defaultId: 0,
        cancelId: 1,
      });
      return response === 0;
    },
  });
}
