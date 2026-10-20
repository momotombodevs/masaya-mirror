import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { PushReadableStream } from '@yume-chan/stream-extra';
import type { MirrorStreamInitMessage, MirrorVideoMetadata } from '../../../../shared/mirror/types';
import { useI18n } from '../../shared/i18n';
import { getManoloApi } from '../../shared/manolo-api';
import { getMirrorStreamClient, useMirrorStream } from './mirror-stream.client';
import { createPacketQueue, type PacketQueue } from './packet-queue';
import type { VideoSize } from './useMirrorInput';

const INIT_TIMEOUT_MS = 15_000;

export type MirrorDecoderOptions = {
  readonly onClose?: () => void;
};

export type MirrorDecoderState = {
  readonly ready: boolean;
  readonly streamError: string | null;
  readonly portStatus: 'waiting' | 'connected' | 'closed';
  readonly videoSizeRef: MutableRefObject<VideoSize>;
};

/**
 * Owns the WebCodecs decoder lifecycle: subscribes to the device stream, decodes
 * video packets onto the canvas, and keeps the main process informed of the
 * rendered video size.
 */
export function useMirrorDecoder(
  deviceId: string,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  options: MirrorDecoderOptions = {},
): MirrorDecoderState {
  const decoderRef = useRef<WebCodecsVideoDecoder | null>(null);
  const videoSizeRef = useRef<VideoSize>({ width: 0, height: 0 });
  const packetQueueRef = useRef<PacketQueue | null>(null);
  const onCloseRef = useRef(options.onClose);
  const [ready, setReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamState = useMirrorStream(deviceId);
  const { t } = useI18n();
  const tRef = useRef(t);
  tRef.current = t;

  onCloseRef.current = options.onClose;

  const syncVideoLayout = useCallback(
    (width: number, height: number): void => {
      if (width <= 0 || height <= 0) {
        return;
      }
      const api = getManoloApi();
      if (api) {
        void api.setMirrorVideoLayout(deviceId, width, height);
      }
    },
    [deviceId],
  );

  useEffect(() => {
    if (streamState.lastError) {
      setStreamError(streamState.lastError);
    }
  }, [streamState.lastError]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    let disposed = false;

    const requestClose = (): void => {
      if (!disposed) {
        onCloseRef.current?.();
      }
    };

    // Packets arriving before the decoder exists wait in the same bounded queue.
    let queue = createPacketQueue();
    let queueConsumed = false;
    packetQueueRef.current = queue;

    const enqueueVideoPacket = (packet: ScrcpyMediaStreamPacket): void => {
      queue.push(packet);
    };

    const setupDecoder = (metadata: MirrorVideoMetadata): void => {
      if (!WebCodecsVideoDecoder.isSupported) {
        setStreamError(tRef.current('mirror.videoUnsupported'));
        return;
      }

      if (decoderRef.current) {
        void decoderRef.current.dispose();
        decoderRef.current = null;
      }

      if (queueConsumed) {
        queue.close();
        queue = createPacketQueue();
        packetQueueRef.current = queue;
      }
      queueConsumed = true;
      const decoderQueue = queue;

      const renderer = new BitmapVideoFrameRenderer(canvas);
      const decoder = new WebCodecsVideoDecoder({ codec: metadata.codec, renderer });
      decoderRef.current = decoder;

      decoder.sizeChanged(({ width, height }) => {
        videoSizeRef.current = { width, height };
        syncVideoLayout(width, height);
      });

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

      void packetStream.pipeTo(decoder.writable).catch((error: unknown) => {
        if (disposed) {
          return;
        }
        const message = error instanceof Error ? error.message : tRef.current('mirror.videoError');
        setStreamError(message);
        requestClose();
      });

      setReady(true);
      setStreamError(null);
    };

    const handleInit = (message: MirrorStreamInitMessage): void => {
      if (message.deviceId !== deviceId) {
        return;
      }
      videoSizeRef.current = { width: message.video.width, height: message.video.height };
      syncVideoLayout(message.video.width, message.video.height);
      setupDecoder(message.video);
    };

    const client = getMirrorStreamClient(deviceId);
    const unsubscribe = client.subscribe({
      onInit: handleInit,
      onVideoPacket: enqueueVideoPacket,
      onAudioPacket: () => undefined,
      onClose: requestClose,
    });

    const initTimeout = window.setTimeout(() => {
      if (!disposed && !queueConsumed) {
        setStreamError(tRef.current('mirror.noSignal'));
      }
    }, INIT_TIMEOUT_MS);

    return () => {
      disposed = true;
      window.clearTimeout(initTimeout);
      unsubscribe();
      queue.close();
      packetQueueRef.current = null;
      if (decoderRef.current) {
        void decoderRef.current.dispose();
        decoderRef.current = null;
      }
      setReady(false);
    };
  }, [deviceId, syncVideoLayout, canvasRef]);

  return { ready, streamError, portStatus: streamState.portStatus, videoSizeRef };
}
