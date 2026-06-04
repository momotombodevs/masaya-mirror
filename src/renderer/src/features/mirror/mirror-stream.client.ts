import { useSyncExternalStore } from 'react';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { clearPendingMirrorPort, registerMirrorPortHandler } from './mirror-port-delivery';
import { isValidMessagePort } from '../../../../shared/mirror/port-message';
import { getManoloApi } from '../../shared/manolo-api';
import type {
  MirrorStreamCloseMessage,
  MirrorStreamInitMessage,
  MirrorStreamMessage,
  MirrorStreamPacketMessage,
} from '../../../../shared/mirror/types';

type MirrorStreamHandlers = {
  onInit: (message: MirrorStreamInitMessage) => void;
  onVideoPacket: (packet: ScrcpyMediaStreamPacket) => void;
  onAudioPacket: (packet: ScrcpyMediaStreamPacket) => void;
  onClose: (message: MirrorStreamCloseMessage) => void;
};

type MirrorStreamSubscriber = MirrorStreamHandlers;

export type MirrorStreamClientState = {
  readonly portStatus: 'waiting' | 'connected' | 'closed';
  readonly init: MirrorStreamInitMessage | null;
  readonly lastError: string | null;
};

type StateListener = (state: MirrorStreamClientState) => void;

function toUint8Array(raw: Uint8Array | ArrayBuffer | readonly number[]): Uint8Array {
  if (raw instanceof Uint8Array) {
    return raw;
  }
  if (raw instanceof ArrayBuffer) {
    return new Uint8Array(raw);
  }
  return Uint8Array.from(raw);
}

function normalizePacketData(packet: MirrorStreamPacketMessage['packet']): ScrcpyMediaStreamPacket {
  const raw = packet.data as Uint8Array | ArrayBuffer | readonly number[] | Record<string, number>;
  const data = Array.isArray(raw)
    ? Uint8Array.from(raw)
    : raw instanceof Uint8Array || raw instanceof ArrayBuffer
      ? toUint8Array(raw)
      : Uint8Array.from(Object.values(raw));

  if (packet.type === 'configuration') {
    return { type: 'configuration', data };
  }
  return {
    type: 'data',
    data,
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
        const packet = normalizePacketData(message.packet);
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
  private readonly subscribers = new Set<MirrorStreamSubscriber>();
  private readonly stateListeners = new Set<StateListener>();
  private state: MirrorStreamClientState = {
    portStatus: 'waiting',
    init: null,
    lastError: null,
  };

  constructor(private readonly deviceId: string) {
    const api = getManoloApi();
    if (!api) {
      this.setState({ lastError: 'API de Manolo Mirror no disponible.' });
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
    listener(this.state);
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  subscribe(handlers: MirrorStreamSubscriber): () => void {
    this.subscribers.add(handlers);
    if (this.state.init) {
      handlers.onInit(this.state.init);
    }
    return () => {
      this.subscribers.delete(handlers);
    };
  }

  private fanOut(handlers: keyof MirrorStreamSubscriber, arg: unknown): void {
    for (const subscriber of this.subscribers) {
      const fn = subscriber[handlers];
      if (typeof fn === 'function') {
        (fn as (value: unknown) => void)(arg);
      }
    }
  }

  private bindPort(port: MessagePort): void {
    this.detachPort?.();
    this.port = port;
    this.setState({ portStatus: 'connected', lastError: null });

    this.detachPort = listenOnPort(port, {
      onInit: (message) => {
        if (message.deviceId !== this.deviceId) {
          return;
        }
        this.setState({ init: message });
        this.fanOut('onInit', message);
      },
      onVideoPacket: (packet) => {
        this.fanOut('onVideoPacket', packet);
      },
      onAudioPacket: (packet) => {
        this.fanOut('onAudioPacket', packet);
      },
      onClose: (message) => {
        this.setState({ portStatus: 'closed' });
        this.fanOut('onClose', message);
      },
    });

    queueMicrotask(() => {
      void this.notifyStreamReadyOnce();
    });
  }

  private async notifyStreamReadyOnce(): Promise<void> {
    const api = getManoloApi();
    if (!api) {
      return;
    }
    const result = await api.notifyMirrorStreamReady(this.deviceId);
    if (!result.ok) {
      this.setState({ lastError: result.error });
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

  return useSyncExternalStore(
    (onStoreChange) => client.subscribeState(() => onStoreChange()),
    () => client.getState(),
    () => client.getState(),
  );
}
