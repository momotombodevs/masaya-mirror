import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { PushReadableStream } from '@yume-chan/stream-extra';
import type {
  MirrorStreamInitMessage,
  MirrorVideoMetadata,
} from '../../../../shared/mirror/types';
import { getManoloApi } from '../../shared/manolo-api';
import { getMirrorStreamClient, useMirrorStream } from './mirror-stream.client';
import type { VideoSize } from './useMirrorInput';

const INIT_TIMEOUT_MS = 15_000;

export type MirrorDecoderOptions = {
  readonly onClose?: () => void;
  readonly onSizeChange?: (width: number, height: number) => void;
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
  const streamControllerRef = useRef<{
    enqueue: (packet: ScrcpyMediaStreamPacket) => void;
    close: () => void;
  } | null>(null);
  const pendingPacketsRef = useRef<ScrcpyMediaStreamPacket[]>([]);
  const onCloseRef = useRef(options.onClose);
  const onSizeChangeRef = useRef(options.onSizeChange);
  const [ready, setReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamState = useMirrorStream(deviceId);

  onCloseRef.current = options.onClose;
  onSizeChangeRef.current = options.onSizeChange;

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

    const flushPendingPackets = (): void => {
      const controller = streamControllerRef.current;
      if (!controller) {
        return;
      }
      for (const packet of pendingPacketsRef.current) {
        controller.enqueue(packet);
      }
      pendingPacketsRef.current = [];
    };

    const enqueueVideoPacket = (packet: ScrcpyMediaStreamPacket): void => {
      if (streamControllerRef.current) {
        streamControllerRef.current.enqueue(packet);
        return;
      }
      pendingPacketsRef.current.push(packet);
    };

    const setupDecoder = (metadata: MirrorVideoMetadata): void => {
      if (!WebCodecsVideoDecoder.isSupported) {
        setStreamError('WebCodecs no está disponible en esta ventana.');
        return;
      }

      if (decoderRef.current) {
        void decoderRef.current.dispose();
        decoderRef.current = null;
      }

      const renderer = new BitmapVideoFrameRenderer(canvas);
      const decoder = new WebCodecsVideoDecoder({ codec: metadata.codec, renderer });
      decoderRef.current = decoder;

      decoder.sizeChanged(({ width, height }) => {
        videoSizeRef.current = { width, height };
        onSizeChangeRef.current?.(width, height);
        syncVideoLayout(width, height);
      });

      const packetStream = new PushReadableStream<ScrcpyMediaStreamPacket>((controller) => {
        streamControllerRef.current = {
          enqueue: (packet) => {
            void controller.enqueue(packet);
          },
          close: () => {
            controller.close();
          },
        };
        flushPendingPackets();
      });

      void packetStream.pipeTo(decoder.writable).catch((error: unknown) => {
        if (disposed) {
          return;
        }
        const message =
          error instanceof Error ? error.message : 'Error en el decodificador de video.';
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
      if (!disposed && !streamControllerRef.current) {
        setStreamError('Sin señal de video. Cierra y vuelve a abrir.');
      }
    }, INIT_TIMEOUT_MS);

    return () => {
      disposed = true;
      window.clearTimeout(initTimeout);
      unsubscribe();
      streamControllerRef.current?.close();
      streamControllerRef.current = null;
      pendingPacketsRef.current = [];
      if (decoderRef.current) {
        void decoderRef.current.dispose();
        decoderRef.current = null;
      }
      setReady(false);
    };
  }, [deviceId, syncVideoLayout, canvasRef]);

  return { ready, streamError, portStatus: streamState.portStatus, videoSizeRef };
}
