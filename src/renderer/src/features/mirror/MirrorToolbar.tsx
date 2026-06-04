import { useCallback, useEffect, useRef, useState } from 'react';
import type { MirrorOptions } from '../../../../shared/mirror/types';
import { CapturePreviewDialog } from './CapturePreviewDialog';
import { captureCanvasPng } from './capture-canvas';
import styles from './MirrorToolbar.module.css';

type CapturePreviewState = {
  readonly url: string;
  readonly buffer: ArrayBuffer;
};

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
}: MirrorToolbarProps) {
  const [recording, setRecording] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [localOptions, setLocalOptions] = useState<MirrorOptions>(options);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [capturePreview, setCapturePreview] = useState<CapturePreviewState | null>(null);
  const [captureBusy, setCaptureBusy] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const showStatus = useCallback((message: string): void => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(null), 2500);
  }, []);

  const closeCapturePreview = useCallback((): void => {
    setCapturePreview((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return null;
    });
  }, []);

  useEffect(() => {
    return () => {
      if (capturePreview) {
        URL.revokeObjectURL(capturePreview.url);
      }
    };
  }, [capturePreview]);

  const handleOpenCapture = useCallback(async (): Promise<void> => {
    if (!canvas) {
      showStatus('Espejo no listo');
      return;
    }

    const buffer = await captureCanvasPng(canvas);
    if (!buffer) {
      showStatus('No se pudo capturar');
      return;
    }

    const url = URL.createObjectURL(new Blob([buffer], { type: 'image/png' }));
    setCapturePreview((current) => {
      if (current) {
        URL.revokeObjectURL(current.url);
      }
      return { url, buffer };
    });
  }, [canvas, showStatus]);

  const handleCopyCapture = useCallback(async (): Promise<void> => {
    if (!capturePreview) {
      return;
    }
    setCaptureBusy(true);
    const result = await window.manolo.copyCapture(capturePreview.buffer);
    setCaptureBusy(false);
    if (result.ok && result.value.copied) {
      showStatus('Copiado al portapapeles');
      closeCapturePreview();
    } else if (!result.ok) {
      showStatus(result.error);
    }
  }, [capturePreview, closeCapturePreview, showStatus]);

  const handleSaveCapture = useCallback(async (): Promise<void> => {
    if (!capturePreview) {
      return;
    }
    setCaptureBusy(true);
    const result = await window.manolo.saveCapture(capturePreview.buffer);
    setCaptureBusy(false);
    if (result.ok && result.value.saved) {
      showStatus('Captura guardada');
      closeCapturePreview();
    } else if (result.ok && !result.value.saved) {
      showStatus('Guardado cancelado');
    } else if (!result.ok) {
      showStatus(result.error);
    }
  }, [capturePreview, closeCapturePreview, showStatus]);

  const handleRecordToggle = useCallback(async (): Promise<void> => {
    if (!canvas) {
      showStatus('Espejo no listo');
      return;
    }

    if (recording && recorderRef.current) {
      recorderRef.current.stop();
      return;
    }

    const stream = canvas.captureStream(30);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = async () => {
      setRecording(false);
      recorderRef.current = null;
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      const result = await window.manolo.saveRecording(buffer, mimeType);
      if (result.ok && result.value.saved) {
        showStatus('Video guardado');
      } else if (!result.ok) {
        showStatus(result.error);
      }
    };
    recorder.start(1000);
    recorderRef.current = recorder;
    setRecording(true);
    showStatus('Grabando');
  }, [canvas, recording, showStatus]);

  const handleApplySettings = useCallback(async (): Promise<void> => {
    const ok = await onApplyOptions(localOptions);
    if (ok) {
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
          onClick={() => void handleOpenCapture()}
          aria-label="Captura"
        >
          <CameraIcon />
        </button>
        <button
          type="button"
          className={`${styles.iconButton} ${recording ? styles.active : ''}`}
          title={recording ? 'Detener' : 'Grabar'}
          disabled={disabled}
          onClick={() => void handleRecordToggle()}
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

    {capturePreview && (
      <CapturePreviewDialog
        imageUrl={capturePreview.url}
        onCopy={() => void handleCopyCapture()}
        onSave={() => void handleSaveCapture()}
        onClose={closeCapturePreview}
        busy={captureBusy}
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
