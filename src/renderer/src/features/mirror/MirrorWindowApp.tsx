import { useCallback, useEffect, useRef, useState } from 'react';
import { MirrorView } from './MirrorView';
import { MirrorToolbar } from './MirrorToolbar';
import { NavigationBar } from './NavigationBar';
import { SettingsPanel } from './settings/SettingsPanel';
import { useMirror } from './useMirror';
import { useReconnect } from './useReconnect';
import { usePreferences } from './usePreferences';
import { DEFAULT_MIRROR_OPTIONS } from '../../../../shared/mirror/types';
import type { MirrorVideoPreferences } from '../../../../shared/preferences/types';
import { Button } from '../../components/ui/Button';
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

  const stoppingRef = useRef(false);
  const optionsRef = useRef(mirror.options);
  optionsRef.current = mirror.options;
  const reopen = useCallback(
    (): Promise<boolean> => openMirrorRef.current(undefined, optionsRef.current),
    [],
  );
  const reconnect = useReconnect({ reopen });

  const handleStopMirror = useCallback(async (): Promise<void> => {
    stoppingRef.current = true;
    reconnect.cancel();
    await mirror.closeMirror();
    window.close();
  }, [mirror, reconnect]);

  // The stream ended on its own (cable pulled, Wi-Fi lost, decoder error): try to bring it back.
  const { begin: beginReconnect } = reconnect;
  const handleStreamClosed = useCallback((): void => {
    if (!stoppingRef.current) {
      beginReconnect();
    }
  }, [beginReconnect]);

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
        {mirror.error && reconnect.state.status === 'idle' && (
          <OverlayError>{mirror.error}</OverlayError>
        )}
        {reconnect.state.status !== 'idle' && (
          <div
            role="status"
            className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3 bg-black/60 px-6 text-center text-base text-mirror-text"
          >
            {reconnect.state.status === 'reconnecting' ? (
              <>
                <p>{t('mirror.reconnecting')}</p>
                <p className="text-sm text-mirror-muted">
                  {t('mirror.reconnectAttempt', {
                    attempt: reconnect.state.attempt,
                    max: reconnect.maxAttempts,
                  })}
                </p>
              </>
            ) : (
              <>
                <p role="alert">{t('mirror.reconnectFailed')}</p>
                <div className="flex gap-2">
                  <Button variant="primary" onClick={reconnect.begin}>
                    {t('common.retry')}
                  </Button>
                  <Button variant="toolbar" onClick={() => void handleStopMirror()}>
                    {t('common.close')}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
        {mirror.isMirrorActive && (
          <MirrorView
            deviceId={deviceId}
            showClicks={preferences.showClicks}
            onClose={handleStreamClosed}
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
