import { useCallback, useEffect, useRef, useState } from 'react';
import { MirrorView } from './MirrorView';
import { MirrorToolbar } from './MirrorToolbar';
import { NavigationBar } from './NavigationBar';
import { SettingsPanel } from './settings/SettingsPanel';
import { useMirror } from './useMirror';
import { usePreferences } from './usePreferences';
import { DEFAULT_MIRROR_OPTIONS } from '../../../../shared/mirror/types';
import type { MirrorVideoPreferences } from '../../../../shared/preferences/types';
import { OverlayError } from '../../components/ui/OverlayError';
import { useI18n } from '../../shared/i18n';
import { getManoloApi } from '../../shared/manolo-api';

type MirrorWindowAppProps = {
  readonly deviceId: string;
  readonly deviceLabel: string;
};

export function MirrorWindowApp({ deviceId, deviceLabel }: MirrorWindowAppProps): JSX.Element {
  const { t } = useI18n();
  const mirrorStageRef = useRef<HTMLDivElement>(null);
  const [mirrorCanvas, setMirrorCanvas] = useState<HTMLCanvasElement | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const mirror = useMirror(deviceId);
  const { preferences, loaded, update } = usePreferences();
  const openMirrorRef = useRef(mirror.openMirror);
  openMirrorRef.current = mirror.openMirror;
  const startVideoRef = useRef(preferences.mirror);
  startVideoRef.current = preferences.mirror;

  // Start once the saved preferences are known, so the stream opens with the user's video settings.
  useEffect(() => {
    if (!loaded) {
      return;
    }
    void openMirrorRef.current(undefined, {
      ...DEFAULT_MIRROR_OPTIONS,
      ...startVideoRef.current,
    });
  }, [deviceId, loaded]);

  const { alwaysOnTop } = preferences;
  useEffect(() => {
    if (loaded) {
      void getManoloApi()?.setAlwaysOnTop(deviceId, alwaysOnTop);
    }
  }, [deviceId, loaded, alwaysOnTop]);

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

  const { applyOptions, options } = mirror;
  const handleVideoChange = useCallback(
    async (patch: Partial<MirrorVideoPreferences>): Promise<void> => {
      const next = { ...options, ...patch };
      if (await applyOptions(next)) {
        update({
          mirror: {
            maxSize: next.maxSize,
            videoBitRate: next.videoBitRate,
            videoCodec: next.videoCodec,
          },
        });
      }
    },
    [applyOptions, options, update],
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-mirror-canvas">
      <MirrorToolbar
        deviceId={deviceId}
        deviceLabel={deviceLabel}
        canvas={mirrorCanvas}
        onFullscreen={handleFullscreen}
        onOpenSettings={() => setSettingsOpen(true)}
        captureAction={preferences.captureAction}
        disabled={mirror.loading}
      />

      <div ref={mirrorStageRef} className="relative min-h-0 flex-1 bg-mirror-canvas">
        {mirror.loading && !mirror.isMirrorActive && (
          <p className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-base text-mirror-muted">
            {t('mirror.connecting')}
          </p>
        )}
        {mirror.error && <OverlayError>{mirror.error}</OverlayError>}
        {mirror.isMirrorActive && (
          <MirrorView
            deviceId={deviceId}
            showClicks={preferences.showClicks}
            onClose={() => void handleStopMirror()}
            onCanvasChange={setMirrorCanvas}
          />
        )}
        {settingsOpen && (
          <SettingsPanel
            deviceId={deviceId}
            preferences={preferences}
            options={mirror.options}
            busy={mirror.loading}
            onPreferenceChange={update}
            onVideoChange={(patch) => void handleVideoChange(patch)}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>

      {preferences.navigationBar && <NavigationBar deviceId={deviceId} disabled={mirror.loading} />}
    </div>
  );
}
