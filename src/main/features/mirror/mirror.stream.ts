import type { MessagePortMain } from 'electron';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import type { ReadableStream } from '@yume-chan/stream-extra';
import type {
  MirrorStreamCloseMessage,
  MirrorStreamInitMessage,
  MirrorStreamMessage,
  MirrorStreamPacketMessage,
  MirrorVideoMetadata,
} from '../../../shared/mirror/types';

function toPacketMessage(
  stream: 'video' | 'audio',
  packet: ScrcpyMediaStreamPacket,
): MirrorStreamPacketMessage {
  if (packet.type === 'configuration') {
    return {
      kind: 'packet',
      stream,
      packet: { type: 'configuration', data: packet.data },
    };
  }
  return {
    kind: 'packet',
    stream,
    packet: {
      type: 'data',
      data: packet.data,
      ...(packet.keyframe !== undefined ? { keyframe: packet.keyframe } : {}),
    },
  };
}

function postMirrorMessage(port: MessagePortMain, message: MirrorStreamMessage): void {
  port.postMessage(message);
}

export async function pipeMediaStream(
  port: MessagePortMain,
  streamKind: 'video' | 'audio',
  stream: ReadableStream<ScrcpyMediaStreamPacket>,
  signal: AbortSignal,
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done || signal.aborted) {
        break;
      }
      postMirrorMessage(port, toPacketMessage(streamKind, value));
    }
  } finally {
    reader.releaseLock();
  }
}

export function sendMirrorInit(
  port: MessagePortMain,
  deviceId: string,
  video: MirrorVideoMetadata,
  audioCodec: string | null,
  audioWebCodecId: string | null,
): void {
  const message: MirrorStreamInitMessage = {
    kind: 'init',
    deviceId,
    video,
    audioCodec,
    audioWebCodecId,
  };
  postMirrorMessage(port, message);
}

export function sendMirrorClose(port: MessagePortMain, reason?: string): void {
  const message: MirrorStreamCloseMessage = { kind: 'close', ...(reason ? { reason } : {}) };
  postMirrorMessage(port, message);
}
