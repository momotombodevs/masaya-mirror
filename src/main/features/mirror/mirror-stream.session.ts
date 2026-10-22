import type { MessagePortMain } from 'electron';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import type { ReadableStream } from '@yume-chan/stream-extra';
import type {
  MirrorStreamMessage,
  MirrorStreamPacketMessage,
  MirrorVideoMetadata,
} from '../../../shared/mirror/types';

export type MirrorStreamSessionParams = {
  readonly deviceId: string;
  /** The session's end of the channel to the window. The session closes it. */
  readonly port: MessagePortMain;
  readonly metadata: MirrorVideoMetadata;
  readonly audioCodec: string | null;
  readonly audioWebCodecId: string | null;
  readonly videoStream: ReadableStream<ScrcpyMediaStreamPacket>;
  readonly audioStream: ReadableStream<ScrcpyMediaStreamPacket> | null;
};

type StreamKind = 'video' | 'audio';

function toPacketMessage(
  stream: StreamKind,
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
      ...(packet.pts !== undefined ? { pts: packet.pts } : {}),
    },
  };
}

function describeError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Sends one device's video and audio to its window over a message port, until closed. */
export class MirrorStreamSession {
  private readonly abort = new AbortController();
  private pipingStarted = false;

  private readonly deviceId: string;
  private readonly port: MessagePortMain;
  private readonly metadata: MirrorVideoMetadata;
  private readonly audioCodec: string | null;
  private readonly audioWebCodecId: string | null;
  private readonly videoStream: ReadableStream<ScrcpyMediaStreamPacket>;
  private readonly audioStream: ReadableStream<ScrcpyMediaStreamPacket> | null;

  constructor(params: MirrorStreamSessionParams) {
    this.deviceId = params.deviceId;
    this.port = params.port;
    this.metadata = params.metadata;
    this.audioCodec = params.audioCodec;
    this.audioWebCodecId = params.audioWebCodecId;
    this.videoStream = params.videoStream;
    this.audioStream = params.audioStream;
  }

  /** Re-sends init on every renderer attach; starts piping only once. */
  onRendererReady(): void {
    this.send({
      kind: 'init',
      deviceId: this.deviceId,
      video: this.metadata,
      audioCodec: this.audioCodec,
      audioWebCodecId: this.audioWebCodecId,
    });

    if (this.pipingStarted) {
      return;
    }
    this.pipingStarted = true;

    this.pipe('video', this.videoStream).catch((error: unknown) => {
      if (!this.abort.signal.aborted) {
        this.send({ kind: 'close', reason: describeError(error, 'Video stream ended') });
      }
    });

    if (this.audioStream) {
      this.pipe('audio', this.audioStream).catch((error: unknown) => {
        // Audio ended; video may continue.
        if (!this.abort.signal.aborted) {
          console.error('[mirror] audio stream ended', error);
        }
      });
    }
  }

  /**
   * Ends the stream. With `notifyRenderer: false` the renderer is not told, so a
   * restart with new options keeps the window open and rebinds to the next port.
   */
  close(reason?: string, { notifyRenderer = true }: { notifyRenderer?: boolean } = {}): void {
    this.abort.abort();
    if (notifyRenderer) {
      this.send({ kind: 'close', ...(reason ? { reason } : {}) });
    }
    this.port.close();
  }

  private send(message: MirrorStreamMessage): void {
    this.port.postMessage(message);
  }

  private async pipe(
    kind: StreamKind,
    stream: ReadableStream<ScrcpyMediaStreamPacket>,
  ): Promise<void> {
    const reader = stream.getReader();
    try {
      while (!this.abort.signal.aborted) {
        const { done, value } = await reader.read();
        if (done || this.abort.signal.aborted) {
          break;
        }
        this.send(toPacketMessage(kind, value));
      }
    } finally {
      reader.releaseLock();
    }
  }
}
