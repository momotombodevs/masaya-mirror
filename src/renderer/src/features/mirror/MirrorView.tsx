import { useRef } from 'react';
import { useMirrorDecoder } from './useMirrorDecoder';
import { useMirrorInput } from './useMirrorInput';
import ui from '../../components/ui/primitives.module.css';
import styles from './MirrorView.module.css';

type MirrorViewProps = {
  readonly deviceId: string;
  readonly onSizeChange?: (width: number, height: number) => void;
  readonly onClose?: () => void;
};

export function MirrorView({ deviceId, onSizeChange, onClose }: MirrorViewProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { ready, streamError, portStatus, videoSizeRef } = useMirrorDecoder(deviceId, canvasRef, {
    onClose,
    onSizeChange,
  });
  const input = useMirrorInput(deviceId, canvasRef, videoSizeRef);

  const showLoading = portStatus === 'waiting' || (!ready && !streamError);

  return (
    <div
      className={styles.viewport}
      tabIndex={0}
      onKeyDown={input.onKeyDown}
      onKeyUp={input.onKeyUp}
    >
      <canvas
        ref={canvasRef}
        className={`${styles.canvas} ${ready ? styles.canvasReady : ''}`}
        onPointerDown={input.onPointerDown}
        onPointerMove={input.onPointerMove}
        onPointerUp={input.onPointerUp}
        onPointerCancel={input.onPointerUp}
        onWheel={input.onWheel}
        onContextMenu={input.onContextMenu}
      />
      {showLoading && <div className={styles.loading}>Conectando…</div>}
      {streamError && (
        <p className={`${ui.overlayError} ${styles.error}`} role="alert">
          {streamError}
        </p>
      )}
    </div>
  );
}
