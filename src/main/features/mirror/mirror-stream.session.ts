import type { MessagePortMain } from 'electron';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import type { ReadableStream } from '@yume-chan/stream-extra';
import type { MirrorVideoMetadata } from '../../../shared/mirror/types';
import { pipeMediaStream, sendMirrorClose, sendMirrorInit } from './mirror.stream';

export type MirrorStreamSessionParams = {
  readonly deviceId: string;
  readonly port: MessagePortMain;
  readonly abort: AbortController;
  readonly metadata: MirrorVideoMetadata;
  readonly audioCodec: string | null;
  readonly audioWebCodecId: string | null;
  readonly videoStream: ReadableStream<ScrcpyMediaStreamPacket>;
  readonly audioStream: ReadableStream<ScrcpyMediaStreamPacket> | null;
};

export class MirrorStreamSession {
  private pipingStarted = false;

  readonly deviceId: string;
  readonly port: MessagePortMain;
  readonly abort: AbortController;
  readonly metadata: MirrorVideoMetadata;
  readonly audioCodec: string | null;
  readonly audioWebCodecId: string | null;
  private readonly videoStream: ReadableStream<ScrcpyMediaStreamPacket>;
  private readonly audioStream: ReadableStream<ScrcpyMediaStreamPacket> | null;

  constructor(params: MirrorStreamSessionParams) {
    this.deviceId = params.deviceId;
    this.port = params.port;
    this.abort = params.abort;
    this.metadata = params.metadata;
    this.audioCodec = params.audioCodec;
    this.audioWebCodecId = params.audioWebCodecId;
    this.videoStream = params.videoStream;
    this.audioStream = params.audioStream;
  }

  /** Re-sends init on every renderer attach; starts piping only once. */
  onRendererReady(): void {
    sendMirrorInit(this.port, this.deviceId, this.metadata, this.audioCodec, this.audioWebCodecId);

    if (this.pipingStarted) {
      return;
    }
    this.pipingStarted = true;

    void pipeMediaStream(this.port, 'video', this.videoStream, this.abort.signal).catch(() => {
      sendMirrorClose(this.port, 'Video stream ended');
    });

    if (this.audioStream) {
      void pipeMediaStream(this.port, 'audio', this.audioStream, this.abort.signal).catch(() => {
        // Audio ended; video may continue.
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
      sendMirrorClose(this.port, reason);
    }
    this.port.close();
  }
}
