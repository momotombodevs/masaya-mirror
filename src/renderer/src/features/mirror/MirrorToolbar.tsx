import { type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { CapturePreviewDialog } from './CapturePreviewDialog';
import { useCapture } from './useCapture';
import { useRecording } from './useRecording';
import {
  MIRROR_QUALITY_ORDER,
  MIRROR_QUALITY_PRESETS,
  type MirrorQualityPreset,
} from '../../../../shared/mirror/quality';
import { useToolbarStatus } from './useToolbarStatus';

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
      <header className="relative flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-mirror-border bg-mirror-1/90 px-5 py-3 text-mirror-text max-md:flex-col max-md:items-start max-md:px-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium">{deviceLabel}</span>
          {statusMessage && <Chip tone="mirror">{statusMessage}</Chip>}
        </div>

        <div className="ml-auto flex items-center gap-2 max-md:ml-0 max-md:w-full max-md:flex-wrap">
          <label className="inline-flex items-center gap-2">
            <span className="text-sm text-mirror-muted">Calidad</span>
            <select
              className="max-w-56 rounded-sm border border-mirror-border bg-transparent px-2 py-1 text-sm text-inherit [color-scheme:dark] disabled:opacity-50"
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
          <Button
            variant="mirror"
            className="text-mirror-muted max-md:flex-[1_1_100%]"
            disabled={disabled}
            onClick={onStop}
          >
            Close
          </Button>
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
  readonly pressed?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
};

function ToolbarIconButton({
  title,
  ariaLabel,
  disabled = false,
  pressed,
  onClick,
  children,
}: ToolbarIconButtonProps): JSX.Element {
  return (
    <Button
      icon
      variant="mirror"
      active={pressed === true}
      title={title}
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={pressed}
    >
      {children}
    </Button>
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
