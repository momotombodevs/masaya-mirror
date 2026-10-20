import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import type { MirrorStreamInitMessage } from '../../../../shared/mirror/types';
import { useI18n } from '../../shared/i18n';
import { callApi } from '../../shared/manolo-api';
import { getMirrorStreamClient, useMirrorStream } from './mirror-stream.client';
import { createVideoPipeline, isVideoDecodingSupported } from './video-pipeline';
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
 * Connects the device stream to a video pipeline on the canvas and keeps the main process
 * informed of the rendered video size. Also owns what the user sees when the stream breaks:
 * stream errors, an unsupported system and a stream that never starts.
 */
export function useMirrorDecoder(
  deviceId: string,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  options: MirrorDecoderOptions = {},
): MirrorDecoderState {
  const videoSizeRef = useRef<VideoSize>({ width: 0, height: 0 });
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
      if (width > 0 && height > 0) {
        void callApi((api) => api.setMirrorVideoLayout(deviceId, width, height), '');
      }
    },
    [deviceId],
  );

  const { lastError } = streamState;
  useEffect(() => {
    if (lastError) {
      setStreamError('key' in lastError ? tRef.current(lastError.key) : lastError.message);
    }
  }, [lastError]);

  // A stream that never announces itself is reported, unless a better reason is already shown.
  useEffect(() => {
    if (ready) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setStreamError((current) => current ?? tRef.current('mirror.noSignal'));
    }, INIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [ready, deviceId]);

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

    const pipeline = createVideoPipeline({
      canvas,
      onSizeChange: (width, height) => {
        videoSizeRef.current = { width, height };
        syncVideoLayout(width, height);
      },
      onFailure: (error) => {
        setStreamError(error instanceof Error ? error.message : tRef.current('mirror.videoError'));
        requestClose();
      },
    });

    const handleInit = (message: MirrorStreamInitMessage): void => {
      if (message.deviceId !== deviceId) {
        return;
      }
      videoSizeRef.current = { width: message.video.width, height: message.video.height };
      syncVideoLayout(message.video.width, message.video.height);

      if (!isVideoDecodingSupported()) {
        setStreamError(tRef.current('mirror.videoUnsupported'));
        return;
      }
      pipeline.start(message.video);
      setReady(true);
      setStreamError(null);
    };

    const unsubscribe = getMirrorStreamClient(deviceId).subscribe({
      onInit: handleInit,
      onVideoPacket: pipeline.push,
      onClose: requestClose,
    });

    return () => {
      disposed = true;
      unsubscribe();
      pipeline.dispose();
      setReady(false);
    };
  }, [deviceId, syncVideoLayout, canvasRef]);

  return { ready, streamError, portStatus: streamState.portStatus, videoSizeRef };
}
