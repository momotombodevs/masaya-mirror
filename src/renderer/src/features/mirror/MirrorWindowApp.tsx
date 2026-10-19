import { useCallback, useEffect, useRef, useState } from 'react';
import { MirrorView } from './MirrorView';
import { MirrorToolbar } from './MirrorToolbar';
import { getMirrorCanvas } from './mirror-canvas';
import { useMirror } from './useMirror';
import { applyQualityPreset, qualityPresetOf } from '../../../../shared/mirror/quality';
import ui from '../../components/ui/primitives.module.css';
import styles from './MirrorWindowApp.module.css';

type MirrorWindowAppProps = {
  readonly deviceId: string;
  readonly deviceLabel: string;
};

export function MirrorWindowApp({ deviceId, deviceLabel }: MirrorWindowAppProps): JSX.Element {
  const mirrorStageRef = useRef<HTMLDivElement>(null);
  const [mirrorCanvas, setMirrorCanvas] = useState<HTMLCanvasElement | null>(null);
  const mirror = useMirror(deviceId);
  const openMirrorRef = useRef(mirror.openMirror);
  openMirrorRef.current = mirror.openMirror;

  useEffect(() => {
    void openMirrorRef.current();
  }, [deviceId]);

  useEffect(() => {
    if (mirror.isMirrorActive) {
      const timer = window.setInterval(() => {
        setMirrorCanvas(getMirrorCanvas(mirrorStageRef.current));
      }, 300);
      return () => window.clearInterval(timer);
    }
    setMirrorCanvas(null);
    return undefined;
  }, [mirror.isMirrorActive]);

  const handleStopMirror = useCallback(async (): Promise<void> => {
    await mirror.closeMirror();
    window.close();
  }, [mirror]);

  const handleFullscreen = useCallback((): void => {
    const el = mirrorStageRef.current;
    if (!el) {
      return;
    }
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void el.requestFullscreen();
    }
  }, []);

  return (
    <div className={styles.window}>
      <MirrorToolbar
        deviceLabel={deviceLabel}
        canvas={mirrorCanvas}
        onFullscreen={handleFullscreen}
        onStop={() => void handleStopMirror()}
        quality={qualityPresetOf(mirror.options)}
        onQualityChange={(preset) =>
          void mirror.applyOptions(applyQualityPreset(mirror.options, preset))
        }
        disabled={mirror.loading}
      />

      <div ref={mirrorStageRef} className={styles.stage}>
        {mirror.loading && <p className={styles.status}>Conectando…</p>}
        {mirror.error && (
          <p className={`${ui.overlayError} ${styles.error}`} role="alert">
            {mirror.error}
          </p>
        )}
        {mirror.isMirrorActive && (
          <MirrorView deviceId={deviceId} onClose={() => void handleStopMirror()} />
        )}
      </div>
    </div>
  );
}
