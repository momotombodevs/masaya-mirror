import {
  isMirrorPortWindowMessage,
  isValidMessagePort,
} from '../../../../shared/mirror/port-message';

type PortHandler = (port: MessagePort) => void;

const handlersByDevice = new Map<string, Set<PortHandler>>();
const pendingPortsByDevice = new Map<string, MessagePort>();

function deliverPort(deviceId: string, port: MessagePort): void {
  const handlers = handlersByDevice.get(deviceId);
  if (handlers && handlers.size > 0) {
    for (const handler of handlers) {
      handler(port);
    }
    return;
  }

  const existing = pendingPortsByDevice.get(deviceId);
  if (existing && existing !== port) {
    existing.close();
  }
  pendingPortsByDevice.set(deviceId, port);
}

function onWindowMessage(event: MessageEvent): void {
  if (event.source !== window) {
    return;
  }
  if (window.location.origin !== 'null' && event.origin !== window.location.origin) {
    return;
  }
  if (!isMirrorPortWindowMessage(event.data)) {
    return;
  }

  const port = event.ports[0];
  if (!isValidMessagePort(port)) {
    return;
  }

  deliverPort(event.data.deviceId, port);
}

if (typeof window !== 'undefined') {
  window.addEventListener('message', onWindowMessage);
}

export function registerMirrorPortHandler(deviceId: string, handler: PortHandler): () => void {
  let handlers = handlersByDevice.get(deviceId);
  if (!handlers) {
    handlers = new Set();
    handlersByDevice.set(deviceId, handlers);
  }
  handlers.add(handler);

  const pending = pendingPortsByDevice.get(deviceId);
  if (pending) {
    pendingPortsByDevice.delete(deviceId);
    handler(pending);
  }

  return () => {
    handlers?.delete(handler);
    if (handlers?.size === 0) {
      handlersByDevice.delete(deviceId);
    }
  };
}

export function clearPendingMirrorPort(deviceId: string): void {
  const pending = pendingPortsByDevice.get(deviceId);
  if (pending) {
    pending.close();
    pendingPortsByDevice.delete(deviceId);
  }
}
