import { useCallback, useSyncExternalStore } from 'react';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { clearPendingMirrorPort, registerMirrorPortHandler } from './mirror-port-delivery';
import { isValidMessagePort } from '../../../../shared/mirror/port-message';
import { callApi, getMasayaApi } from '../../shared/masaya-api';
import type { MessageKey } from '../../../../shared/i18n/messages';
import type {
  MirrorStreamCloseMessage,
  MirrorStreamInitMessage,
  MirrorStreamMessage,
  MirrorStreamPacketMessage,
} from '../../../../shared/mirror/types';

/** What a subscriber may listen to; every handler is optional. */
export type MirrorStreamHandlers = {
  onInit: (message: MirrorStreamInitMessage) => void;
  onVideoPacket: (packet: ScrcpyMediaStreamPacket) => void;
  onAudioPacket: (packet: ScrcpyMediaStreamPacket) => void;
  onClose: (message: MirrorStreamCloseMessage) => void;
};

/** Why the stream failed: a translatable message of ours, or text reported by the main process. */
type MirrorStreamError = { readonly key: MessageKey } | { readonly message: string };

export type MirrorStreamClientState = {
  readonly portStatus: 'waiting' | 'connected' | 'closed';
  readonly init: MirrorStreamInitMessage | null;
  readonly lastError: MirrorStreamError | null;
};

type StateListener = (state: MirrorStreamClientState) => void;

/**
 * Packets cross the MessagePort by structured clone, which keeps a Uint8Array a Uint8Array.
 * Anything else is malformed and is skipped rather than guessed at.
 */
function toMediaPacket(
  packet: MirrorStreamPacketMessage['packet'],
): ScrcpyMediaStreamPacket | null {
  if (!(packet.data instanceof Uint8Array)) {
    return null;
  }
  if (packet.type === 'configuration') {
    return { type: 'configuration', data: packet.data };
  }
  return {
    type: 'data',
    data: packet.data,
    ...(packet.keyframe !== undefined ? { keyframe: packet.keyframe } : {}),
  };
}

function listenOnPort(port: MessagePort, handlers: MirrorStreamHandlers): () => void {
  if (!isValidMessagePort(port)) {
    throw new Error('Invalid MessagePort: cannot attach mirror stream.');
  }

  const listener = (event: MessageEvent<MirrorStreamMessage>): void => {
    const message = event.data;
    if (!message || typeof message !== 'object' || !('kind' in message)) {
      return;
    }

    switch (message.kind) {
      case 'init':
        handlers.onInit(message);
        break;
      case 'packet': {
        const packet = toMediaPacket(message.packet);
        if (!packet) {
          break;
        }
        if (message.stream === 'video') {
          handlers.onVideoPacket(packet);
        } else {
          handlers.onAudioPacket(packet);
        }
        break;
      }
      case 'close':
        handlers.onClose(message);
        break;
      default:
        break;
    }
  };

  port.addEventListener('message', listener);
  port.start();

  return () => {
    port.removeEventListener('message', listener);
  };
}

export class MirrorStreamClient {
  private port: MessagePort | null = null;
  private detachPort: (() => void) | null = null;
  private unsubscribePort: (() => void) | null = null;
  private readonly subscribers = new Set<Partial<MirrorStreamHandlers>>();
  private readonly stateListeners = new Set<StateListener>();
  private state: MirrorStreamClientState = {
    portStatus: 'waiting',
    init: null,
    lastError: null,
  };

  constructor(private readonly deviceId: string) {
    const api = getMasayaApi();
    if (!api) {
      this.setState({ lastError: { key: 'mirror.apiUnavailable' } });
      return;
    }

    this.unsubscribePort = registerMirrorPortHandler(deviceId, (port) => {
      this.bindPort(port);
    });
  }

  private setState(patch: Partial<MirrorStreamClientState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.stateListeners) {
      listener(this.state);
    }
  }

  getState(): MirrorStreamClientState {
    return this.state;
  }

  subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  subscribe(handlers: Partial<MirrorStreamHandlers>): () => void {
    this.subscribers.add(handlers);
    if (this.state.init) {
      handlers.onInit?.(this.state.init);
    }
    return () => {
      this.subscribers.delete(handlers);
    };
  }

  private emit(call: (subscriber: Partial<MirrorStreamHandlers>) => void): void {
    for (const subscriber of this.subscribers) {
      call(subscriber);
    }
  }

  private bindPort(port: MessagePort): void {
    // A new port means a new session: drop the old port and what it announced.
    this.detachPort?.();
    if (this.port && this.port !== port) {
      this.port.close();
    }
    this.port = port;
    this.setState({ portStatus: 'connected', init: null, lastError: null });

    this.detachPort = listenOnPort(port, {
      onInit: (message) => {
        if (message.deviceId !== this.deviceId) {
          return;
        }
        this.setState({ init: message });
        this.emit((subscriber) => subscriber.onInit?.(message));
      },
      onVideoPacket: (packet) => {
        this.emit((subscriber) => subscriber.onVideoPacket?.(packet));
      },
      onAudioPacket: (packet) => {
        this.emit((subscriber) => subscriber.onAudioPacket?.(packet));
      },
      onClose: (message) => {
        this.setState({ portStatus: 'closed' });
        this.emit((subscriber) => subscriber.onClose?.(message));
      },
    });

    queueMicrotask(() => {
      void this.notifyStreamReadyOnce();
    });
  }

  private async notifyStreamReadyOnce(): Promise<void> {
    const result = await callApi((api) => api.notifyMirrorStreamReady(this.deviceId), '');
    if (!result.ok) {
      // An empty message means the call itself failed (no bridge, or it rejected).
      this.setState({
        lastError: result.error ? { message: result.error } : { key: 'mirror.apiUnavailable' },
      });
    }
  }

  dispose(): void {
    this.detachPort?.();
    this.detachPort = null;
    this.unsubscribePort?.();
    this.unsubscribePort = null;
    if (this.port) {
      this.port.close();
      this.port = null;
    }
    clearPendingMirrorPort(this.deviceId);
    this.subscribers.clear();
    this.stateListeners.clear();
  }
}

const clientsByDevice = new Map<string, MirrorStreamClient>();

export function getMirrorStreamClient(deviceId: string): MirrorStreamClient {
  let client = clientsByDevice.get(deviceId);
  if (!client) {
    client = new MirrorStreamClient(deviceId);
    clientsByDevice.set(deviceId, client);
  }
  return client;
}

export function disposeMirrorStreamClient(deviceId: string): void {
  const client = clientsByDevice.get(deviceId);
  if (client) {
    client.dispose();
    clientsByDevice.delete(deviceId);
  }
}

export function useMirrorStream(deviceId: string): MirrorStreamClientState {
  const client = getMirrorStreamClient(deviceId);
  // Stable per client, so React does not unsubscribe and resubscribe on every render.
  const subscribe = useCallback(
    (onStoreChange: () => void) => client.subscribeState(onStoreChange),
    [client],
  );
  const getSnapshot = useCallback(() => client.getState(), [client]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
