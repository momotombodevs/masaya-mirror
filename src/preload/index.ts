import { contextBridge, ipcRenderer } from 'electron';
import { MIRROR_CHANNELS } from '../shared/ipc/mirror.contract';
import { MIRROR_PORT_WINDOW_MESSAGE } from '../shared/mirror/port-message';
import { manoloApi } from './manolo.api';

ipcRenderer.on(MIRROR_CHANNELS.port, (event, payload: { deviceId?: string }) => {
  const port = event.ports[0];
  if (
    !port ||
    typeof port.addEventListener !== 'function' ||
    typeof payload?.deviceId !== 'string'
  ) {
    return;
  }

  window.postMessage(
    { type: MIRROR_PORT_WINDOW_MESSAGE, deviceId: payload.deviceId },
    '*',
    [port],
  );
});

contextBridge.exposeInMainWorld('manolo', manoloApi);
