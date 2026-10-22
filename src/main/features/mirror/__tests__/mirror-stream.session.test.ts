import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MirrorStreamSession } from '../mirror-stream.session';

type Packet = { type: 'data'; data: Uint8Array; keyframe?: boolean; pts?: bigint };

function streamOf(...packets: Packet[]) {
  return new ReadableStream<never>({
    start(controller) {
      for (const packet of packets) {
        controller.enqueue(packet as never);
      }
      controller.close();
    },
  });
}

function failingStream(error: unknown) {
  return new ReadableStream<never>({
    pull(controller) {
      controller.error(error);
    },
  });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('MirrorStreamSession', () => {
  const port = { postMessage: vi.fn(), close: vi.fn() };
  const metadata = { codec: 1748121140, width: 1080, height: 1920 } as never;

  const createSession = (
    videoStream: ReadableStream<never>,
    audioStream: ReadableStream<never> | null = null,
  ) =>
    new MirrorStreamSession({
      deviceId: 'device1',
      port: port as never,
      metadata,
      audioCodec: null,
      audioWebCodecId: null,
      videoStream: videoStream as never,
      audioStream: audioStream as never,
    });

  const messages = () => port.postMessage.mock.calls.map(([message]) => message);
  const lastMessage = () => messages()[messages().length - 1];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-sends init on every onRendererReady but pipes only once', async () => {
    const session = createSession(streamOf({ type: 'data', data: new Uint8Array([1]) }));

    session.onRendererReady();
    session.onRendererReady();
    await flush();

    const sent = messages();
    expect(sent.filter((message) => message.kind === 'init')).toHaveLength(2);
    expect(sent.filter((message) => message.kind === 'packet')).toHaveLength(1);
  });

  it('forwards video packets after init', async () => {
    const session = createSession(
      streamOf({ type: 'data', data: new Uint8Array([1]), keyframe: true }),
    );

    session.onRendererReady();
    await flush();

    expect(messages()).toEqual([
      {
        kind: 'init',
        deviceId: 'device1',
        video: metadata,
        audioCodec: null,
        audioWebCodecId: null,
      },
      {
        kind: 'packet',
        stream: 'video',
        packet: { type: 'data', data: new Uint8Array([1]), keyframe: true },
      },
    ]);
  });

  it('forwards the device timestamp of a packet', async () => {
    createSession(
      streamOf({ type: 'data', data: new Uint8Array([1]), pts: 1234n }),
    ).onRendererReady();
    await flush();

    expect(lastMessage()).toMatchObject({ packet: { pts: 1234n } });
  });

  it('tells the renderer why the video stream failed', async () => {
    createSession(failingStream(new Error('device went away'))).onRendererReady();
    await flush();

    expect(lastMessage()).toEqual({ kind: 'close', reason: 'device went away' });
  });

  it('falls back to a generic reason when the failure has no message', async () => {
    createSession(failingStream('boom')).onRendererReady();
    await flush();

    expect(lastMessage()).toEqual({ kind: 'close', reason: 'Video stream ended' });
  });

  describe('close', () => {
    it('tells the renderer the stream ended by default', () => {
      createSession(streamOf()).close('bye');

      expect(messages()).toEqual([{ kind: 'close', reason: 'bye' }]);
      expect(port.close).toHaveBeenCalledTimes(1);
    });

    it('closes silently when the renderer must stay open', () => {
      createSession(streamOf()).close(undefined, { notifyRenderer: false });

      expect(port.postMessage).not.toHaveBeenCalled();
      expect(port.close).toHaveBeenCalledTimes(1);
    });

    it('stops piping once closed', async () => {
      const session = createSession(streamOf({ type: 'data', data: new Uint8Array([1]) }));
      session.onRendererReady();
      session.close(undefined, { notifyRenderer: false });
      await flush();

      expect(messages().filter((message) => message.kind === 'packet')).toHaveLength(0);
    });
  });
});
