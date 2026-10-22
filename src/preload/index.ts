import { contextBridge, ipcRenderer } from 'electron';
import { MIRROR_CHANNELS } from '../shared/ipc/mirror.contract';
import { MIRROR_PORT_WINDOW_MESSAGE, isValidMessagePort } from '../shared/mirror/port-message';
import { createMainWindowApi, createMirrorWindowApi } from './masaya.api';

ipcRenderer.on(MIRROR_CHANNELS.port, (event, payload: { deviceId?: string }) => {
  const port = event.ports[0];
  if (!isValidMessagePort(port) || typeof payload?.deviceId !== 'string') {
    return;
  }

  // Posted to this same window; the receiver accepts it only when `event.source` is this window.
  window.postMessage({ type: MIRROR_PORT_WINDOW_MESSAGE, deviceId: payload.deviceId }, '*', [port]);
});

const isMirrorWindow = new URLSearchParams(window.location.search).has('deviceId');
contextBridge.exposeInMainWorld(
  'masaya',
  isMirrorWindow ? createMirrorWindowApi() : createMainWindowApi(),
);
