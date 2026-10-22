import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MirrorStreamInitMessage } from '../../../../../shared/mirror/types';
import { ScrcpyVideoCodecId } from '@yume-chan/scrcpy';

type Listener = (event: MessageEvent<unknown>) => void;

function fakePort() {
  const listeners = new Set<Listener>();
  const port = {
    addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
    start: vi.fn(),
    close: vi.fn(),
    dispatchEvent: () => true,
    onmessage: null,
    onmessageerror: null,
    postMessage: () => undefined,
  } as unknown as MessagePort;
  const emit = (data: unknown): void =>
    listeners.forEach((listener) => listener({ data } as never));
  return { port, emit };
}

const hoisted = vi.hoisted(() => ({
  deliver: { current: (_port: unknown): void => undefined },
  unregister: vi.fn(),
  clearPending: vi.fn(),
}));

vi.mock('../mirror-port-delivery', () => ({
  registerMirrorPortHandler: (_deviceId: string, handler: (port: unknown) => void) => {
    hoisted.deliver.current = handler;
    return hoisted.unregister;
  },
  clearPendingMirrorPort: hoisted.clearPending,
}));

const init = (width: number): MirrorStreamInitMessage => ({
  kind: 'init',
  deviceId: 'device-1',
  video: { codec: ScrcpyVideoCodecId.H264, width, height: 2 * width },
  audioCodec: null,
  audioWebCodecId: null,
});

describe('MirrorStreamClient ports', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('window', {
      masaya: {
        notifyMirrorStreamReady: vi.fn().mockResolvedValue({ ok: true, value: undefined }),
      },
    });
  });

  afterEach(async () => {
    const { disposeMirrorStreamClient } = await import('../mirror-stream.client');
    disposeMirrorStreamClient('device-1');
    vi.unstubAllGlobals();
  });

  it('closes the previous port and forgets its init when a new port arrives', async () => {
    const { getMirrorStreamClient } = await import('../mirror-stream.client');
    const client = getMirrorStreamClient('device-1');
    const first = fakePort();
    const second = fakePort();

    hoisted.deliver.current(first.port);
    first.emit(init(1080));
    expect(client.getState().init?.video.width).toBe(1080);

    hoisted.deliver.current(second.port);

    expect(first.port.close).toHaveBeenCalledOnce();
    expect(client.getState().init).toBeNull();
    expect(client.getState().portStatus).toBe('connected');
  });

  it('does not replay an old init to a subscriber that arrives after a new port', async () => {
    const { getMirrorStreamClient } = await import('../mirror-stream.client');
    const client = getMirrorStreamClient('device-1');
    const first = fakePort();
    hoisted.deliver.current(first.port);
    first.emit(init(1080));
    hoisted.deliver.current(fakePort().port);
    const onInit = vi.fn();

    client.subscribe({ onInit });

    expect(onInit).not.toHaveBeenCalled();
  });

  it('delivers packets as Uint8Array to the subscribers that listen for them', async () => {
    const { getMirrorStreamClient } = await import('../mirror-stream.client');
    const client = getMirrorStreamClient('device-1');
    const onVideoPacket = vi.fn();
    const onAudioPacket = vi.fn();
    client.subscribe({ onVideoPacket });
    client.subscribe({ onAudioPacket });
    client.subscribe({}); // listens to nothing, and must not break the others
    const { port, emit } = fakePort();
    hoisted.deliver.current(port);

    emit({
      kind: 'packet',
      stream: 'video',
      packet: { type: 'data', data: new Uint8Array([1, 2]), keyframe: true },
    });
    emit({
      kind: 'packet',
      stream: 'audio',
      packet: { type: 'configuration', data: new Uint8Array([3]) },
    });

    expect(onVideoPacket).toHaveBeenCalledWith({
      type: 'data',
      data: new Uint8Array([1, 2]),
      keyframe: true,
    });
    expect(onAudioPacket).toHaveBeenCalledWith({
      type: 'configuration',
      data: new Uint8Array([3]),
    });
  });

  it('skips a packet whose data is not a Uint8Array', async () => {
    const { getMirrorStreamClient } = await import('../mirror-stream.client');
    const client = getMirrorStreamClient('device-1');
    const onVideoPacket = vi.fn();
    client.subscribe({ onVideoPacket });
    const { port, emit } = fakePort();
    hoisted.deliver.current(port);

    emit({ kind: 'packet', stream: 'video', packet: { type: 'data', data: [1, 2, 3] } });

    expect(onVideoPacket).not.toHaveBeenCalled();
  });

  it('closes its port and unregisters when disposed', async () => {
    const { getMirrorStreamClient, disposeMirrorStreamClient } =
      await import('../mirror-stream.client');
    getMirrorStreamClient('device-1');
    const { port } = fakePort();
    hoisted.deliver.current(port);

    disposeMirrorStreamClient('device-1');

    expect(port.close).toHaveBeenCalledOnce();
    expect(hoisted.unregister).toHaveBeenCalledOnce();
    expect(hoisted.clearPending).toHaveBeenCalledWith('device-1');
  });
});
