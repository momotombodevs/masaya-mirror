import { contextBridge, ipcRenderer } from 'electron';
import { MIRROR_CHANNELS } from '../shared/ipc/mirror.contract';
import { MIRROR_PORT_WINDOW_MESSAGE, isValidMessagePort } from '../shared/mirror/port-message';
import { createMainWindowApi, createMirrorWindowApi } from './manolo.api';

ipcRenderer.on(MIRROR_CHANNELS.port, (event, payload: { deviceId?: string }) => {
  const port = event.ports[0];
  if (!isValidMessagePort(port) || typeof payload?.deviceId !== 'string') {
    return;
  }

  const targetOrigin = window.location.origin === 'null' ? '*' : window.location.origin;

  window.postMessage(
    { type: MIRROR_PORT_WINDOW_MESSAGE, deviceId: payload.deviceId },
    targetOrigin,
    [port],
  );
});

const isMirrorWindow = new URLSearchParams(window.location.search).has('deviceId');
contextBridge.exposeInMainWorld(
  'manolo',
  isMirrorWindow ? createMirrorWindowApi() : createMainWindowApi(),
);
