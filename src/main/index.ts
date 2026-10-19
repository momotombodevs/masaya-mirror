import { app } from 'electron';
import path from 'node:path';
import { installApplicationMenu } from './app-menu';
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
import { registerQaIpcHandlers } from './features/qa/ipc/qa.handlers';

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

  app.on('will-quit', () => {
    mirrorWindowService.closeAll();
    void scrcpyService.closeAll();
  });

  void app.whenReady().then(() => {
    installApplicationMenu();
    registerDeviceIpcHandlers(deviceService);
    registerSetupIpcHandlers(
      adbService,
      preferences,
      mirrorWindowService,
      new QrPairingService(adbService),
    );
    registerApkIpcHandlers(adbService, mirrorWindowService);
    registerDeviceSettingsIpcHandlers(adbService, mirrorWindowService);
    registerPreferencesIpcHandlers(preferences);
    registerMirrorIpcHandlers(scrcpyService, mirrorWindowService);
    registerQaIpcHandlers(mirrorWindowService, preferences);
    createWindow();
  });
}

if (claimSingleInstance()) {
  bootstrap();
} else {
  app.quit();
}
