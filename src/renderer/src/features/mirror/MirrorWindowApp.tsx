import { useCallback, useEffect, useRef, useState } from 'react';
import { MirrorView, getMirrorCanvas } from './MirrorView';
import { MirrorToolbar } from './MirrorToolbar';
import { useMirror } from './useMirror';
import styles from './MirrorWindowApp.module.css';

type MirrorWindowAppProps = {
  readonly deviceId: string;
  readonly deviceLabel: string;
};

export function MirrorWindowApp({ deviceId, deviceLabel }: MirrorWindowAppProps) {
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
        options={mirror.options}
        onApplyOptions={mirror.applyOptions}
        onFullscreen={handleFullscreen}
        onStop={() => void handleStopMirror()}
        disabled={mirror.loading}
      />

      <div ref={mirrorStageRef} className={styles.stage}>
        {mirror.loading && <p className={styles.status}>Conectando…</p>}
        {mirror.error && (
          <p className={styles.error} role="alert">
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

export function parseMirrorWindowParams(): { deviceId: string; deviceLabel: string } | null {
  const params = new URLSearchParams(window.location.search);
  const deviceId = params.get('deviceId');
  if (!deviceId) {
    return null;
  }
  const label = params.get('label')?.trim();
  return { deviceId, deviceLabel: label && label.length > 0 ? label : deviceId };
}
