import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';
import type { MirrorStreamInitMessage } from '../../../../../shared/mirror/types';

type MessageListener = (event: MessageEvent<unknown>) => void;

function createMockMessagePort(onStart?: (port: MessagePort) => void): MessagePort {
  const listeners: MessageListener[] = [];
  const port: MessagePort = {
    addEventListener: (_type: string, listener: MessageListener) => {
      listeners.push(listener);
    },
    removeEventListener: () => undefined,
    start: () => {
      onStart?.(port);
    },
    close: () => undefined,
    dispatchEvent: () => true,
    onmessage: null,
    onmessageerror: null,
    postMessage: (data: unknown) => {
      for (const listener of listeners) {
        listener({ data } as MessageEvent<unknown>);
      }
    },
  } as MessagePort;

  return port;
}

const notifyMirrorStreamReady = vi.fn().mockResolvedValue({ ok: true });

vi.mock('../mirror-port-delivery', () => ({
  registerMirrorPortHandler: vi.fn(
    (_deviceId: string, handler: (port: MessagePort) => void) => {
      const port = createMockMessagePort(() => {
        const initMessage: MirrorStreamInitMessage = {
          kind: 'init',
          deviceId: 'device1',
          video: { codec: ScrcpyVideoCodecId.H264, width: 1080, height: 1920 },
          audioCodec: null,
          audioWebCodecId: null,
        };
        port.postMessage(initMessage);
      });
      queueMicrotask(() => handler(port));
      return () => undefined;
    },
  ),
  clearPendingMirrorPort: vi.fn(),
}));

describe('MirrorStreamClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      manolo: {
        notifyMirrorStreamReady,
      },
    });
  });

  afterEach(async () => {
    const { disposeMirrorStreamClient } = await import('../mirror-stream.client');
    disposeMirrorStreamClient('device1');
    vi.unstubAllGlobals();
  });

  it('delivers init to subscribers and notifies main when port connects', async () => {
    const { getMirrorStreamClient } = await import('../mirror-stream.client');
    const client = getMirrorStreamClient('device1');
    const onInit = vi.fn();

    client.subscribe({
      onInit,
      onVideoPacket: () => undefined,
      onAudioPacket: () => undefined,
      onClose: () => undefined,
    });

    await vi.waitFor(() => {
      expect(onInit).toHaveBeenCalled();
    });

    expect(notifyMirrorStreamReady).toHaveBeenCalledWith('device1');

    const initCall = onInit.mock.calls[0]?.[0] as MirrorStreamInitMessage;
    expect(initCall.kind).toBe('init');
    expect(initCall.deviceId).toBe('device1');
  });
});
