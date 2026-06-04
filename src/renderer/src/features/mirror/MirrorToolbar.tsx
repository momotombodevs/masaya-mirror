import { useCallback, useEffect, useState } from 'react';
import type { MirrorOptions } from '../../../../shared/mirror/types';
import { CapturePreviewDialog } from './CapturePreviewDialog';
import { useCapture } from './useCapture';
import { useRecording } from './useRecording';
import { useToolbarStatus } from './useToolbarStatus';
import styles from './MirrorToolbar.module.css';

type MirrorToolbarProps = {
  readonly deviceLabel: string;
  readonly canvas: HTMLCanvasElement | null;
  readonly options: MirrorOptions;
  readonly onApplyOptions: (options: MirrorOptions) => Promise<boolean>;
  readonly onFullscreen: () => void;
  readonly onStop: () => void;
  readonly disabled?: boolean;
};

export function MirrorToolbar({
  deviceLabel,
  canvas,
  options,
  onApplyOptions,
  onFullscreen,
  onStop,
  disabled = false,
}: MirrorToolbarProps): JSX.Element {
  const [showSettings, setShowSettings] = useState(false);
  const [localOptions, setLocalOptions] = useState<MirrorOptions>(options);
  const { statusMessage, showStatus } = useToolbarStatus();
  const capture = useCapture(canvas, showStatus);
  const recorder = useRecording(canvas, showStatus);

  useEffect(() => {
    setLocalOptions(options);
  }, [options]);

  const handleApplySettings = useCallback(async (): Promise<void> => {
    const applied = await onApplyOptions(localOptions);
    if (applied) {
      setShowSettings(false);
      showStatus('Listo');
    }
  }, [localOptions, onApplyOptions, showStatus]);

  return (
    <>
    <header className={styles.toolbar}>
      <div className={styles.lead}>
        <span className={styles.deviceName}>{deviceLabel}</span>
        {statusMessage && <span className={styles.status}>{statusMessage}</span>}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconButton}
          title="Captura (vista previa)"
          disabled={disabled || !canvas}
          onClick={() => void capture.open()}
          aria-label="Captura"
        >
          <CameraIcon />
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${recorder.recording ? styles.active : ''}`}
          title={recorder.recording ? 'Detener' : 'Grabar'}
          disabled={disabled}
          onClick={() => void recorder.toggle()}
          aria-label="Grabar"
        >
          <RecordIcon />
        </button>
        <button
          type="button"
          className={styles.iconButton}
          title="Pantalla completa"
          disabled={disabled}
          onClick={onFullscreen}
          aria-label="Pantalla completa"
        >
          <FullscreenIcon />
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${showSettings ? styles.active : ''}`}
          title="Ajustes"
          disabled={disabled}
          onClick={() => setShowSettings((value) => !value)}
          aria-label="Ajustes"
        >
          <SettingsIcon />
        </button>
        <button type="button" className={styles.stopButton} disabled={disabled} onClick={onStop}>
          Cerrar
        </button>
      </div>

      {showSettings && (
        <div className={styles.settingsPanel}>
          <label className={styles.field}>
            Resolución
            <select
              value={localOptions.maxSize}
              onChange={(e) =>
                setLocalOptions((prev) => ({
                  ...prev,
                  maxSize: Number(e.target.value),
                }))
              }
            >
              <option value={0}>Nativa</option>
              <option value={1080}>1080p</option>
              <option value={1920}>Full HD (1920)</option>
            </select>
          </label>
          <label className={styles.field}>
            Bitrate
            <select
              value={localOptions.videoBitRate}
              onChange={(e) =>
                setLocalOptions((prev) => ({
                  ...prev,
                  videoBitRate: Number(e.target.value),
                }))
              }
            >
              <option value={2_000_000}>2 Mbps</option>
              <option value={4_000_000}>4 Mbps</option>
              <option value={8_000_000}>8 Mbps</option>
              <option value={16_000_000}>16 Mbps (recomendado)</option>
            </select>
          </label>
          <label className={styles.field}>
            Códec
            <select
              value={localOptions.videoCodec}
              onChange={(e) =>
                setLocalOptions((prev) => ({
                  ...prev,
                  videoCodec: e.target.value as MirrorOptions['videoCodec'],
                }))
              }
            >
              <option value="h264">H.264</option>
              <option value="h265">H.265</option>
            </select>
          </label>
          <button type="button" className={styles.applyButton} onClick={() => void handleApplySettings()}>
            Aplicar
          </button>
        </div>
      )}
    </header>

    {capture.preview && (
      <CapturePreviewDialog
        imageUrl={capture.preview.url}
        onCopy={() => void capture.copy()}
        onSave={() => void capture.save()}
        onClose={capture.close}
        busy={capture.busy}
      />
    )}
    </>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function FullscreenIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
