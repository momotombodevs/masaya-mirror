import { useCallback, useEffect, useRef } from 'react';
import { useMirrorDecoder } from './useMirrorDecoder';
import { useMirrorAudio } from './useMirrorAudio';
import { useMirrorInput } from './useMirrorInput';
import { TouchIndicators } from './TouchIndicators';
import { useI18n } from '../../shared/i18n';
import { OverlayError } from '../../components/ui/OverlayError';
import { cx } from '../../components/ui/cx';
import { disposeMirrorStreamClient } from './mirror-stream.client';

type MirrorViewProps = {
  readonly deviceId: string;
  readonly showClicks?: boolean;
  readonly onClose?: () => void;
  readonly onCanvasChange?: (canvas: HTMLCanvasElement | null) => void;
};

export function MirrorView({
  deviceId,
  showClicks = false,
  onClose,
  onCanvasChange,
}: MirrorViewProps): JSX.Element {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const attachCanvas = useCallback(
    (canvas: HTMLCanvasElement | null): void => {
      canvasRef.current = canvas;
      onCanvasChange?.(canvas);
    },
    [onCanvasChange],
  );
  const { ready, streamError, portStatus, videoSizeRef } = useMirrorDecoder(deviceId, canvasRef, {
    onClose,
  });
  useMirrorAudio(deviceId);
  const input = useMirrorInput(deviceId, canvasRef, videoSizeRef);

  // This view owns the stream client of its device and releases it (closing its MessagePort)
  // on unmount. Declared after the hooks above, whose cleanups unsubscribe first.
  useEffect(() => () => disposeMirrorStreamClient(deviceId), [deviceId]);

  const showLoading = portStatus === 'waiting' || (!ready && !streamError);

  return (
    <div
      className="absolute inset-0 flex items-center justify-center outline-none focus-visible:shadow-[inset_0_0_0_3px_rgba(255,255,255,0.15)]"
      tabIndex={0}
      onKeyDown={input.onKeyDown}
      onKeyUp={input.onKeyUp}
    >
      <canvas
        ref={attachCanvas}
        className={cx(
          'block h-auto max-h-full w-auto max-w-full cursor-crosshair touch-none transition-opacity duration-200',
          ready ? 'opacity-100' : 'opacity-0',
        )}
        onPointerDown={input.onPointerDown}
        onPointerMove={input.onPointerMove}
        onPointerUp={input.onPointerUp}
        onPointerCancel={input.onPointerUp}
        onWheel={input.onWheel}
        onContextMenu={input.onContextMenu}
      />
      {showClicks && <TouchIndicators canvasRef={canvasRef} />}
      {showLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-base text-mirror-muted">
          {t('mirror.connecting')}
        </div>
      )}
      {streamError && <OverlayError>{streamError}</OverlayError>}
    </div>
  );
}
