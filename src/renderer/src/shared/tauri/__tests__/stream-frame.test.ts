import { describe, expect, it } from 'vitest';
import { decodeStreamFrame } from '../stream-frame';

const bytes = (...values: number[]): ArrayBuffer => new Uint8Array(values).buffer;

describe('decodeStreamFrame', () => {
  it('reads a video data frame: keyframe flag, pts and payload', () => {
    // Same bytes as the Rust test `a_data_packet_carries_flags_pts_and_bytes`.
    const message = decodeStreamFrame(bytes(2, 1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 8, 7));
    expect(message).toEqual({
      kind: 'packet',
      stream: 'video',
      packet: {
        type: 'data',
        keyframe: true,
        pts: 0x0102030405060708n,
        data: new Uint8Array([9, 8, 7]),
      },
    });
  });

  it('reads an audio delta frame', () => {
    const message = decodeStreamFrame(bytes(4, 0, 0, 0, 0, 0, 0, 0, 0, 1, 5));
    expect(message).toMatchObject({
      stream: 'audio',
      packet: { type: 'data', keyframe: false, pts: 1n, data: new Uint8Array([5]) },
    });
  });

  it('reads codec configuration for both tracks', () => {
    expect(decodeStreamFrame(bytes(1, 0, 0, 1))).toEqual({
      kind: 'packet',
      stream: 'video',
      packet: { type: 'configuration', data: new Uint8Array([0, 0, 1]) },
    });
    expect(decodeStreamFrame(bytes(3, 7))).toMatchObject({ stream: 'audio' });
  });

  it('reads init, with null for absent audio', () => {
    const json = JSON.stringify({
      deviceId: 'R5CT',
      video: { codec: 0x68323634, width: 1080, height: 2400 },
      audioCodec: null,
      audioWebCodecId: null,
    });
    const payload = new TextEncoder().encode(json);
    const frame = new Uint8Array(1 + payload.length);
    frame.set(payload, 1);
    expect(decodeStreamFrame(frame.buffer)).toEqual({
      kind: 'init',
      deviceId: 'R5CT',
      video: { codec: 0x68323634, width: 1080, height: 2400 },
      audioCodec: null,
      audioWebCodecId: null,
    });
  });

  it('reads close with and without a reason', () => {
    expect(decodeStreamFrame(bytes(5))).toEqual({ kind: 'close' });
    expect(decodeStreamFrame(bytes(5, 102, 105, 110))).toEqual({ kind: 'close', reason: 'fin' });
  });

  it('skips what it does not understand instead of guessing', () => {
    expect(decodeStreamFrame(new ArrayBuffer(0))).toBeNull();
    expect(decodeStreamFrame(bytes(9, 1, 2))).toBeNull();
    expect(decodeStreamFrame(bytes(2, 1, 0))).toBeNull(); // truncated data header
    expect(decodeStreamFrame(bytes(0, 123))).toBeNull(); // init that is not JSON
  });
});
