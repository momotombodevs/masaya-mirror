import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { PushReadableStream } from '@yume-chan/stream-extra';
import type { MirrorVideoMetadata } from '../../../../shared/mirror/types';
import { createPacketQueue, type PacketQueue } from './packet-queue';

export type VideoPipelineOptions = {
  readonly canvas: HTMLCanvasElement;
  /** The decoder reports a new picture size (rotation, resolution change). */
  readonly onSizeChange: (width: number, height: number) => void;
  /** Decoding broke and cannot continue. Never called after `dispose`. */
  readonly onFailure: (error: unknown) => void;
};

export type VideoPipeline = {
  /** Queues a packet; packets arriving before `start` wait in the same bounded queue. */
  push(packet: ScrcpyMediaStreamPacket): void;
  /** Starts decoding a stream onto the canvas, replacing the decoder of an earlier stream. */
  start(metadata: MirrorVideoMetadata): void;
  dispose(): void;
};

export const isVideoDecodingSupported = (): boolean => WebCodecsVideoDecoder.isSupported;

/**
 * Video packets in, pictures on the canvas out: a bounded packet queue feeding a WebCodecs
 * decoder. It knows nothing about React, timeouts or error text.
 */
export function createVideoPipeline({
  canvas,
  onSizeChange,
  onFailure,
}: VideoPipelineOptions): VideoPipeline {
  let queue: PacketQueue = createPacketQueue();
  let queueConsumed = false;
  let decoder: WebCodecsVideoDecoder | null = null;
  let disposed = false;

  const disposeDecoder = (): void => {
    if (decoder) {
      void decoder.dispose();
      decoder = null;
    }
  };

  return {
    push(packet) {
      queue.push(packet);
    },

    start(metadata) {
      disposeDecoder();

      // The first decoder takes over what is already queued; later ones start from a fresh queue.
      if (queueConsumed) {
        queue.close();
        queue = createPacketQueue();
      }
      queueConsumed = true;
      const decoderQueue = queue;

      const next = new WebCodecsVideoDecoder({
        codec: metadata.codec,
        renderer: new BitmapVideoFrameRenderer(canvas),
      });
      decoder = next;
      next.sizeChanged(({ width, height }) => onSizeChange(width, height));

      // Pull packets from the bounded queue only as fast as the decoder accepts
      // them. Backlog is dropped inside the queue, so latency cannot keep growing.
      const packetStream = new PushReadableStream<ScrcpyMediaStreamPacket>(async (controller) => {
        for (;;) {
          const packet = await decoderQueue.next();
          if (!packet) {
            return;
          }
          await controller.enqueue(packet);
        }
      });

      void packetStream.pipeTo(next.writable).catch((error: unknown) => {
        if (!disposed) {
          onFailure(error);
        }
      });
    },

    dispose() {
      disposed = true;
      queue.close();
      disposeDecoder();
    },
  };
}
