import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BitmapVideoFrameRenderer,
  WebCodecsVideoDecoder,
} from '@yume-chan/scrcpy-decoder-webcodecs';
import type { ScrcpyMediaStreamPacket } from '@yume-chan/scrcpy';
import { PushReadableStream } from '@yume-chan/stream-extra';
import {
  ANDROID_KEY_EVENT_ACTION,
  ANDROID_MOTION_EVENT_ACTION,
  type MirrorStreamInitMessage,
  type MirrorVideoMetadata,
} from '../../../../shared/mirror/types';
import { getMirrorStreamClient, useMirrorStream } from './mirror-stream.client';
import styles from './MirrorView.module.css';

type MirrorViewProps = {
  readonly deviceId: string;
  readonly onSizeChange?: (width: number, height: number) => void;
  readonly onClose?: () => void;
};

export function MirrorView({ deviceId, onSizeChange, onClose }: MirrorViewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const decoderRef = useRef<WebCodecsVideoDecoder | null>(null);
  const videoSizeRef = useRef({ width: 0, height: 0 });
  const streamControllerRef = useRef<{
    enqueue: (packet: ScrcpyMediaStreamPacket) => void;
    close: () => void;
  } | null>(null);
  const pendingPacketsRef = useRef<ScrcpyMediaStreamPacket[]>([]);
  const onCloseRef = useRef(onClose);
  const onSizeChangeRef = useRef(onSizeChange);
  const [ready, setReady] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const streamState = useMirrorStream(deviceId);

  onCloseRef.current = onClose;
  onSizeChangeRef.current = onSizeChange;

  const syncVideoLayout = useCallback(
    (width: number, height: number): void => {
      if (width <= 0 || height <= 0) {
        return;
      }
      void window.manolo.setMirrorVideoLayout(deviceId, width, height);
    },
    [deviceId],
  );

  const sendControl = useCallback(
    (message: Parameters<typeof window.manolo.sendControl>[1]): void => {
      void window.manolo.sendControl(deviceId, message);
    },
    [deviceId],
  );

  const mapPointerToDevice = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const canvas = canvasRef.current;
      const { width, height } = videoSizeRef.current;
      if (!canvas || width === 0 || height === 0) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      const x = Math.round(((clientX - rect.left) / rect.width) * width);
      const y = Math.round(((clientY - rect.top) / rect.height) * height);
      return { x, y };
    },
    [],
  );

  const injectTouch = useCallback(
    (action: number, clientX: number, clientY: number, pressure: number): void => {
      const coords = mapPointerToDevice(clientX, clientY);
      const { width, height } = videoSizeRef.current;
      if (!coords || width === 0 || height === 0) {
        return;
      }
      sendControl({
        type: 'touch',
        action,
        pointerId: 0,
        pointerX: coords.x,
        pointerY: coords.y,
        videoWidth: width,
        videoHeight: height,
        pressure,
        buttons: 0,
        actionButton: 0,
      });
    },
    [mapPointerToDevice, sendControl],
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
      if (disposed) {
        return;
      }
      onCloseRef.current?.();
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
      const decoder = new WebCodecsVideoDecoder({
        codec: metadata.codec,
        renderer,
      });
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
        const message = error instanceof Error ? error.message : 'Error en el decodificador de video.';
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
      videoSizeRef.current = {
        width: message.video.width,
        height: message.video.height,
      };
      syncVideoLayout(message.video.width, message.video.height);
      setupDecoder(message.video);
    };

    const client = getMirrorStreamClient(deviceId);
    const unsubscribe = client.subscribe({
      onInit: handleInit,
      onVideoPacket: enqueueVideoPacket,
      onAudioPacket: () => undefined,
      onClose: () => {
        requestClose();
      },
    });

    const initTimeout = window.setTimeout(() => {
      if (!disposed && !streamControllerRef.current) {
        setStreamError('Sin señal de video. Cierra y vuelve a abrir.');
      }
    }, 15_000);

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
  }, [deviceId, syncVideoLayout]);

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    injectTouch(ANDROID_MOTION_EVENT_ACTION.down, event.clientX, event.clientY, 1);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
      return;
    }
    injectTouch(ANDROID_MOTION_EVENT_ACTION.move, event.clientX, event.clientY, 1);
  };

  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    injectTouch(ANDROID_MOTION_EVENT_ACTION.up, event.clientX, event.clientY, 0);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onWheel = (event: React.WheelEvent<HTMLCanvasElement>): void => {
    event.preventDefault();
    const coords = mapPointerToDevice(event.clientX, event.clientY);
    const { width, height } = videoSizeRef.current;
    if (!coords || width === 0 || height === 0) {
      return;
    }
    sendControl({
      type: 'scroll',
      pointerX: coords.x,
      pointerY: coords.y,
      videoWidth: width,
      videoHeight: height,
      scrollX: -event.deltaX / width,
      scrollY: -event.deltaY / height,
      buttons: 0,
    });
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      return;
    }
    sendControl({
      type: 'key',
      action: ANDROID_KEY_EVENT_ACTION.down,
      keyCode: event.keyCode,
      repeat: 0,
      metaState: 0,
    });
  };

  const onKeyUp = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    sendControl({
      type: 'key',
      action: ANDROID_KEY_EVENT_ACTION.up,
      keyCode: event.keyCode,
      repeat: 0,
      metaState: 0,
    });
  };

  const showLoading =
    streamState.portStatus === 'waiting' || (!ready && !streamError);

  return (
    <div
      ref={containerRef}
      className={styles.viewport}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
    >
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${ready ? styles.canvasReady : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        onWheel={onWheel}
      />
      {showLoading && <div className={styles.loading}>Conectando…</div>}
      {streamError && (
        <p className={styles.error} role="alert">
          {streamError}
        </p>
      )}
    </div>
  );
}

export function getMirrorCanvas(container: HTMLElement | null): HTMLCanvasElement | null {
  return container?.querySelector('canvas') ?? null;
}
