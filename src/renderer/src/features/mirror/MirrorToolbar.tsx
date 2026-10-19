import { type ReactNode } from 'react';
import { CapturePreviewDialog } from './CapturePreviewDialog';
import { useCapture } from './useCapture';
import { useRecording } from './useRecording';
import {
  MIRROR_QUALITY_ORDER,
  MIRROR_QUALITY_PRESETS,
  type MirrorQualityPreset,
} from '../../../../shared/mirror/quality';
import { useToolbarStatus } from './useToolbarStatus';
import ui from '../../components/ui/primitives.module.css';
import styles from './MirrorToolbar.module.css';

type MirrorToolbarProps = {
  readonly deviceLabel: string;
  readonly canvas: HTMLCanvasElement | null;
  readonly onFullscreen: () => void;
  readonly onStop: () => void;
  readonly quality: MirrorQualityPreset | null;
  readonly onQualityChange: (preset: MirrorQualityPreset) => void;
  readonly disabled?: boolean;
};

export function MirrorToolbar({
  deviceLabel,
  canvas,
  onFullscreen,
  onStop,
  quality,
  onQualityChange,
  disabled = false,
}: MirrorToolbarProps): JSX.Element {
  const { statusMessage, showStatus } = useToolbarStatus();
  const capture = useCapture(canvas, showStatus);
  const recorder = useRecording(canvas, showStatus);

  return (
    <>
      <header className={styles.toolbar}>
        <div className={styles.lead}>
          <span className={styles.deviceName}>{deviceLabel}</span>
          {statusMessage && <span className={`${ui.chip} ${ui.chipMirror} ${styles.status}`}>{statusMessage}</span>}
        </div>

        <div className={styles.actions}>
          <label className={styles.qualityLabel}>
            <span className={styles.qualityText}>Calidad</span>
            <select
              className={styles.qualitySelect}
              value={quality ?? ''}
              disabled={disabled}
              onChange={(event) => onQualityChange(event.target.value as MirrorQualityPreset)}
            >
              {quality === null && <option value="">Personalizada</option>}
              {MIRROR_QUALITY_ORDER.map((preset) => (
                <option key={preset} value={preset}>
                  {MIRROR_QUALITY_PRESETS[preset].label}
                </option>
              ))}
            </select>
          </label>

          <ToolbarIconButton
            title="Capture preview"
            ariaLabel="Capture"
            disabled={disabled || !canvas}
            onClick={() => void capture.open()}
          >
            <CameraIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            title={recorder.recording ? 'Stop recording' : 'Start recording'}
            ariaLabel={recorder.recording ? 'Stop recording' : 'Start recording'}
            disabled={disabled}
            active={recorder.recording}
            pressed={recorder.recording}
            onClick={() => void recorder.toggle()}
          >
            <RecordIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            title="Fullscreen"
            ariaLabel="Fullscreen"
            disabled={disabled}
            onClick={onFullscreen}
          >
            <FullscreenIcon />
          </ToolbarIconButton>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonMirror} ${styles.stopButton}`}
            disabled={disabled}
            onClick={onStop}
          >
            Close
          </button>
        </div>
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

type ToolbarIconButtonProps = {
  readonly title: string;
  readonly ariaLabel: string;
  readonly disabled?: boolean;
  readonly active?: boolean;
  readonly pressed?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
};

function ToolbarIconButton({
  title,
  ariaLabel,
  disabled = false,
  active,
  pressed,
  onClick,
  children,
}: ToolbarIconButtonProps): JSX.Element {
  const isActive = active === true;

  return (
    <button
      type="button"
      className={`${ui.button} ${ui.iconButton} ${ui.iconButtonMirror} ${isActive ? ui.active : ''} ${styles.iconButton}`}
      title={title}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pressed === undefined ? undefined : pressed}
    >
      {children}
    </button>
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
