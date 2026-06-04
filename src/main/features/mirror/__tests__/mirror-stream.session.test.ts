import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MirrorStreamSession } from '../mirror-stream.session';
import * as mirrorStream from '../mirror.stream';

vi.mock('../mirror.stream', () => ({
  sendMirrorInit: vi.fn(),
  sendMirrorClose: vi.fn(),
  pipeMediaStream: vi.fn().mockResolvedValue(undefined),
}));

describe('MirrorStreamSession', () => {
  const port = { postMessage: vi.fn(), close: vi.fn() };
  const abort = new AbortController();
  const videoStream = { getReader: vi.fn() };
  const audioStream = null;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('re-sends init on every onRendererReady but pipes only once', () => {
    const session = new MirrorStreamSession({
      deviceId: 'device1',
      port: port as never,
      abort,
      metadata: { codec: 1748121140, width: 1080, height: 1920 },
      audioCodec: null,
      audioWebCodecId: null,
      videoStream: videoStream as never,
      audioStream,
    });

    session.onRendererReady();
    session.onRendererReady();

    expect(vi.mocked(mirrorStream.sendMirrorInit)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(mirrorStream.pipeMediaStream)).toHaveBeenCalledTimes(1);
  });
});
