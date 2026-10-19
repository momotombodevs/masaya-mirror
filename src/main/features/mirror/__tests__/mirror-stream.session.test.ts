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

  describe('close', () => {
    const createSession = () =>
      new MirrorStreamSession({
        deviceId: 'device1',
        port: port as never,
        abort: new AbortController(),
        metadata: { codec: 1748121140, width: 1080, height: 1920 },
        audioCodec: null,
        audioWebCodecId: null,
        videoStream: videoStream as never,
        audioStream,
      });

    it('tells the renderer the stream ended by default', () => {
      createSession().close('bye');

      expect(vi.mocked(mirrorStream.sendMirrorClose)).toHaveBeenCalledWith(port, 'bye');
      expect(port.close).toHaveBeenCalledTimes(1);
    });

    it('closes silently when the renderer must stay open', () => {
      createSession().close(undefined, { notifyRenderer: false });

      expect(vi.mocked(mirrorStream.sendMirrorClose)).not.toHaveBeenCalled();
      expect(port.close).toHaveBeenCalledTimes(1);
    });
  });
});
