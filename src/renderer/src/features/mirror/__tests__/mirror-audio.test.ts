import { describe, expect, it, vi } from 'vitest';
import { MirrorAudioPlayer, type AudioOutput, type MirrorAudioDeps } from '../mirror-audio';

function setup(webCodecId = 'opus') {
  const source = { buffer: null as unknown, connect: vi.fn(), start: vi.fn() };
  const output = {
    currentTime: 10,
    resume: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    createBuffer: vi.fn(() => ({ duration: 0.02, copyToChannel: vi.fn() })),
    createBufferSource: vi.fn(() => source),
    destination: {},
  };
  const decoder = { decodeQueueSize: 0, configure: vi.fn(), decode: vi.fn(), close: vi.fn() };
  let emit: (data: AudioData) => void = () => undefined;
  let fail: (error: Error) => void = () => undefined;
  const deps: MirrorAudioDeps = {
    createOutput: () => output as unknown as AudioOutput,
    createDecoder: (init) => {
      emit = init.output;
      fail = init.error;
      return decoder;
    },
    createChunk: (data, timestamp) => ({ data, timestamp }) as unknown as EncodedAudioChunk,
  };
  const player = new MirrorAudioPlayer(webCodecId, deps);
  const block = (): AudioData =>
    ({
      numberOfChannels: 2,
      numberOfFrames: 960,
      sampleRate: 48_000,
      copyTo: vi.fn(),
      close: vi.fn(),
    }) as unknown as AudioData;
  return {
    player,
    output,
    decoder,
    source,
    emit: (d: AudioData) => emit(d),
    fail: (e: Error) => fail(e),
    block,
  };
}

const data = (bytes: number[]) => ({ type: 'data' as const, data: new Uint8Array(bytes) });

describe('MirrorAudioPlayer', () => {
  it('configures the decoder for the stream codec and starts the output', () => {
    const { decoder, output } = setup('opus');

    expect(decoder.configure).toHaveBeenCalledWith({
      codec: 'opus',
      sampleRate: 48_000,
      numberOfChannels: 2,
    });
    expect(output.resume).toHaveBeenCalled();
  });

  it('decodes data packets and ignores the Opus configuration packet', () => {
    const { player, decoder } = setup('opus');

    player.push({ type: 'configuration', data: new Uint8Array([1]) });
    player.push(data([2, 3]));

    expect(decoder.decode).toHaveBeenCalledTimes(1);
    expect(decoder.configure).toHaveBeenCalledTimes(1);
  });

  it('reconfigures other codecs with their configuration packet as description', () => {
    const { player, decoder } = setup('mp4a.66');

    player.push({ type: 'configuration', data: new Uint8Array([9]) });

    expect(decoder.configure).toHaveBeenLastCalledWith(
      expect.objectContaining({ codec: 'mp4a.66', description: new Uint8Array([9]) }),
    );
  });

  it('schedules decoded blocks back to back after a short lead', () => {
    const { emit, block, source } = setup();

    emit(block());
    emit(block());

    expect(source.start.mock.calls[0]?.[0]).toBeCloseTo(10.04);
    expect(source.start.mock.calls[1]?.[0]).toBeCloseTo(10.06);
  });

  it('drops blocks that would play too far behind the picture', () => {
    const { emit, block, source } = setup();

    for (let i = 0; i < 40; i += 1) {
      emit(block());
    }

    expect(source.start.mock.calls.length).toBeLessThan(40);
    expect(source.start.mock.calls.length).toBeGreaterThan(5);
  });

  it('timestamps packets by their own pts when the stream has one', () => {
    const { player, decoder } = setup();
    const chunks: number[] = [];
    decoder.decode.mockImplementation((chunk: { timestamp: number }) =>
      chunks.push(chunk.timestamp),
    );

    player.push({ type: 'data', data: new Uint8Array([1]), pts: 50_000n });
    player.push({ type: 'data', data: new Uint8Array([2]), pts: 90_000n });

    expect(chunks).toEqual([50_000, 90_000]);
  });

  it('falls back to a 20 ms step per packet without pts', () => {
    const { player, decoder } = setup();
    const chunks: number[] = [];
    decoder.decode.mockImplementation((chunk: { timestamp: number }) =>
      chunks.push(chunk.timestamp),
    );

    player.push(data([1]));
    player.push(data([2]));

    expect(chunks).toEqual([20_000, 40_000]);
  });

  it('drops encoded packets while the decoder is far behind', () => {
    const { player, decoder } = setup();

    decoder.decodeQueueSize = 50;
    player.push(data([1]));
    expect(decoder.decode).not.toHaveBeenCalled();

    decoder.decodeQueueSize = 0;
    player.push(data([2]));
    expect(decoder.decode).toHaveBeenCalledTimes(1);
  });

  it('stops and releases everything on dispose, ignoring later packets', () => {
    const { player, decoder, output } = setup();

    player.dispose();
    player.push(data([1]));

    expect(decoder.close).toHaveBeenCalledTimes(1);
    expect(output.close).toHaveBeenCalledTimes(1);
    expect(decoder.decode).not.toHaveBeenCalled();
  });

  it('shuts down when the decoder reports an error', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { fail, decoder } = setup();

    fail(new Error('bad stream'));

    expect(decoder.close).toHaveBeenCalled();
  });
});
