import { app } from 'electron';
import { installApplicationMenu } from './app-menu';
import { createWindow, registerAppLifecycle } from './app';
import { augmentProcessPath } from './features/device/adb-path.resolver';
import { AdbService } from './features/device/adb.service';
import { DeviceService } from './features/device/device.service';
import { registerDeviceIpcHandlers } from './features/device/ipc/device.handlers';
import { MirrorWindowService } from './features/mirror/mirror-window.service';
import { ScrcpyService } from './features/mirror/scrcpy.service';
import { registerMirrorIpcHandlers } from './features/mirror/ipc/mirror.handlers';
import { registerQaIpcHandlers } from './features/qa/ipc/qa.handlers';

augmentProcessPath();

const adbService = new AdbService();
const deviceService = new DeviceService(adbService);
const scrcpyService = new ScrcpyService(adbService);
const mirrorWindowService = new MirrorWindowService({ scrcpyService });
registerAppLifecycle();

app.on('will-quit', () => {
  mirrorWindowService.closeAll();
  void scrcpyService.closeAll();
});

app.whenReady().then(() => {
  installApplicationMenu();
  registerDeviceIpcHandlers(deviceService);
  registerMirrorIpcHandlers(scrcpyService, mirrorWindowService);
  registerQaIpcHandlers(mirrorWindowService);
  createWindow();
});
