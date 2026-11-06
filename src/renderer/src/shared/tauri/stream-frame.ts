import type { MirrorStreamMessage, MirrorVideoMetadata } from '../../../../shared/mirror/types';

/**
 * Decodes the frames the Rust shell sends over a Tauri `Channel`. The layout is documented in
 * `crates/masaya-core/src/scrcpy/frame.rs`; the two must change together.
 */
const TAG = {
  init: 0,
  videoConfig: 1,
  videoData: 2,
  audioConfig: 3,
  audioData: 4,
  close: 5,
} as const;

const KEYFRAME_FLAG = 1;
/** Flags (1 byte) and presentation time (8 bytes) after the tag of a data frame. */
const DATA_HEADER_BYTES = 9;

const textDecoder = new TextDecoder();

export function decodeStreamFrame(buffer: ArrayBuffer): MirrorStreamMessage | null {
  if (buffer.byteLength === 0) {
    return null;
  }
  const view = new DataView(buffer);
  const tag = view.getUint8(0);

  switch (tag) {
    case TAG.init:
      return decodeInit(new Uint8Array(buffer, 1));
    case TAG.videoConfig:
    case TAG.audioConfig:
      return {
        kind: 'packet',
        stream: tag === TAG.videoConfig ? 'video' : 'audio',
        packet: { type: 'configuration', data: new Uint8Array(buffer, 1) },
      };
    case TAG.videoData:
    case TAG.audioData: {
      if (buffer.byteLength < 1 + DATA_HEADER_BYTES) {
        return null;
      }
      return {
        kind: 'packet',
        stream: tag === TAG.videoData ? 'video' : 'audio',
        packet: {
          type: 'data',
          keyframe: (view.getUint8(1) & KEYFRAME_FLAG) !== 0,
          pts: view.getBigUint64(2),
          data: new Uint8Array(buffer, 1 + DATA_HEADER_BYTES),
        },
      };
    }
    case TAG.close: {
      const reason = textDecoder.decode(new Uint8Array(buffer, 1));
      return reason ? { kind: 'close', reason } : { kind: 'close' };
    }
    default:
      return null;
  }
}

function decodeInit(json: Uint8Array): MirrorStreamMessage | null {
  try {
    const value: unknown = JSON.parse(textDecoder.decode(json));
    if (typeof value !== 'object' || value === null) {
      return null;
    }
    const init = value as Record<string, unknown>;
    const video = init.video as Record<string, unknown> | undefined;
    if (
      typeof init.deviceId !== 'string' ||
      typeof video?.codec !== 'number' ||
      typeof video.width !== 'number' ||
      typeof video.height !== 'number'
    ) {
      return null;
    }
    return {
      kind: 'init',
      deviceId: init.deviceId,
      video: {
        codec: video.codec as MirrorVideoMetadata['codec'],
        width: video.width,
        height: video.height,
      },
      audioCodec: typeof init.audioCodec === 'string' ? init.audioCodec : null,
      audioWebCodecId: typeof init.audioWebCodecId === 'string' ? init.audioWebCodecId : null,
    };
  } catch {
    return null;
  }
}
