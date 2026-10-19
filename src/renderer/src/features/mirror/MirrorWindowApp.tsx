import { useCallback, useEffect, useRef, useState } from 'react';
import { MirrorView } from './MirrorView';
import { MirrorToolbar } from './MirrorToolbar';
import { useMirror } from './useMirror';
import {
  applyQualityPreset,
  qualityPresetOf,
  type MirrorQualityPreset,
} from '../../../../shared/mirror/quality';
import { DEFAULT_MIRROR_OPTIONS } from '../../../../shared/mirror/types';
import { getManoloApi } from '../../shared/manolo-api';
import { OverlayError } from '../../components/ui/OverlayError';

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

  // Start with the quality the user used last. A missing or failing preference never blocks the mirror.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const prefs = await getManoloApi()
        ?.getPreferences()
        .catch(() => undefined);
      if (cancelled) {
        return;
      }
      const startOptions = prefs?.ok
        ? applyQualityPreset(DEFAULT_MIRROR_OPTIONS, prefs.value.quality)
        : undefined;
      await openMirrorRef.current(undefined, startOptions);
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const handleQualityChange = useCallback(
    async (preset: MirrorQualityPreset): Promise<void> => {
      const applied = await mirror.applyOptions(applyQualityPreset(mirror.options, preset));
      if (applied) {
        void getManoloApi()?.setPreferences({ quality: preset });
      }
    },
    [mirror],
  );

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
    <div className="flex h-screen flex-col overflow-hidden bg-mirror-canvas">
      <MirrorToolbar
        deviceId={deviceId}
        deviceLabel={deviceLabel}
        canvas={mirrorCanvas}
        onFullscreen={handleFullscreen}
        quality={qualityPresetOf(mirror.options)}
        onQualityChange={(preset) => void handleQualityChange(preset)}
        disabled={mirror.loading}
      />

      <div ref={mirrorStageRef} className="relative min-h-0 flex-1 bg-mirror-canvas">
        {mirror.loading && !mirror.isMirrorActive && (
          <p className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-base text-mirror-muted">
            Conectando…
          </p>
        )}
        {mirror.error && <OverlayError>{mirror.error}</OverlayError>}
        {mirror.isMirrorActive && (
          <MirrorView
            deviceId={deviceId}
            onClose={() => void handleStopMirror()}
            onCanvasChange={setMirrorCanvas}
          />
        )}
      </div>
    </div>
  );
}
