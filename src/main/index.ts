import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { installApplicationMenu } from './app-menu';
import { setMainLocale } from './i18n';
import { claimSingleInstance, createWindow, registerAppLifecycle } from './app';
import { augmentProcessPath } from './features/device/adb-path.resolver';
import { AdbService } from './features/device/adb.service';
import { DeviceService } from './features/device/device.service';
import { registerApkIpcHandlers } from './features/device/ipc/apk.handlers';
import { registerDeviceSettingsIpcHandlers } from './features/device/ipc/device-settings.handlers';
import { registerDeviceIpcHandlers } from './features/device/ipc/device.handlers';
import { QrPairingService } from './features/device/qr-pairing.service';
import { registerSetupIpcHandlers } from './features/device/ipc/setup.handlers';
import { MirrorWindowService } from './features/mirror/mirror-window.service';
import { ScrcpyService } from './features/mirror/scrcpy.service';
import { registerMirrorIpcHandlers } from './features/mirror/ipc/mirror.handlers';
import { registerPreferencesIpcHandlers } from './features/preferences/ipc/preferences.handlers';
import { PreferencesService } from './features/preferences/preferences.service';
import { resolveLocale } from '../shared/i18n/locale';
import { PREFERENCES_CHANNELS } from '../shared/ipc/preferences.contract';
import { registerQaIpcHandlers } from './features/qa/ipc/qa.handlers';
import { createUpdaterService } from './features/updates/register-updater';

function bootstrap(): void {
  augmentProcessPath();

  const adbService = new AdbService();
  const deviceService = new DeviceService(adbService);
  const scrcpyService = new ScrcpyService(adbService);
  const preferences = new PreferencesService(path.join(app.getPath('userData'), 'settings.json'));
  adbService.setCustomPath(preferences.getAdbPath());
  const mirrorWindowService = new MirrorWindowService({
    scrcpyService,
    isNavigationBarShown: () => preferences.get().navigationBar,
  });
  registerAppLifecycle();

  let sessionsClosed = false;
  app.on('will-quit', (event) => {
    mirrorWindowService.closeAll();
    if (sessionsClosed) {
      return;
    }
    // Let scrcpy servers and adb sockets release before the process exits.
    event.preventDefault();
    void scrcpyService.closeAll().finally(() => {
      sessionsClosed = true;
      app.quit();
    });
  });

  void app.whenReady().then(() => {
    // getLocale is only reliable once the app is ready.
    const locale = resolveLocale(preferences.get().language, app.getLocale());
    setMainLocale(locale);
    const updater = createUpdaterService();
    const onCheckForUpdates = updater ? () => void updater.checkNow() : undefined;
    installApplicationMenu(locale, onCheckForUpdates);
    registerDeviceIpcHandlers(deviceService);
    registerSetupIpcHandlers(
      adbService,
      preferences,
      mirrorWindowService,
      new QrPairingService(adbService),
    );
    registerApkIpcHandlers(adbService, mirrorWindowService);
    registerDeviceSettingsIpcHandlers(adbService, mirrorWindowService);
    registerPreferencesIpcHandlers(preferences, {
      onLanguageChange: (language) => {
        const locale = resolveLocale(language, app.getLocale());
        setMainLocale(locale);
        installApplicationMenu(locale, onCheckForUpdates);
        for (const window of BrowserWindow.getAllWindows()) {
          window.webContents.send(PREFERENCES_CHANNELS.languageChanged, language);
        }
      },
    });
    registerMirrorIpcHandlers(scrcpyService, mirrorWindowService);
    registerQaIpcHandlers(mirrorWindowService, preferences);
    createWindow();
    updater?.start();
  });
}

if (claimSingleInstance()) {
  bootstrap();
} else {
  app.quit();
}
