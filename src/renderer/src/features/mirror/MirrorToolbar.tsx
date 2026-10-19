import { type ReactNode } from 'react';
import type { CaptureAction } from '../../../../shared/preferences/types';
import { Button } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import { CapturePreviewDialog } from './CapturePreviewDialog';
import { useCapture } from './useCapture';
import { useRecording } from './useRecording';
import { useI18n } from '../../shared/i18n';
import { useMenuActions } from '../../shared/useMenuAction';
import { ANDROID_KEYCODE } from './android-keycodes';
import { useApkInstall } from './useApkInstall';
import { useDeviceKeys } from './useDeviceKeys';
import { useToolbarStatus } from './useToolbarStatus';

type MirrorToolbarProps = {
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly canvas: HTMLCanvasElement | null;
  readonly onFullscreen: () => void;
  readonly onOpenSettings: () => void;
  readonly captureAction: CaptureAction;
  readonly disabled?: boolean;
};

export function MirrorToolbar({
  deviceId,
  deviceLabel,
  canvas,
  onFullscreen,
  onOpenSettings,
  captureAction,
  disabled = false,
}: MirrorToolbarProps): JSX.Element {
  const { t } = useI18n();
  const { statusMessage, showStatus } = useToolbarStatus();
  const capture = useCapture(canvas, showStatus, captureAction);
  const recorder = useRecording(canvas, showStatus);
  const pressKey = useDeviceKeys(deviceId);
  const apk = useApkInstall(deviceId, showStatus);

  useMenuActions({
    capture: () => void capture.open(),
    record: () => void recorder.toggle(),
    settings: onOpenSettings,
  });

  return (
    <>
      <header className="relative flex min-h-[52px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-mirror-line bg-mirror-bar/95 px-3 py-2 text-mirror-text backdrop-blur-xl">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-base font-medium">{deviceLabel}</span>
          {statusMessage && (
            <span className="whitespace-nowrap text-sm text-mirror-muted">{statusMessage}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <ToolbarIconButton
            label={t('toolbar.volumeUp')}
            disabled={disabled}
            onClick={() => pressKey(ANDROID_KEYCODE.volumeUp)}
          >
            <VolumeUpIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t('toolbar.volumeDown')}
            disabled={disabled}
            onClick={() => pressKey(ANDROID_KEYCODE.volumeDown)}
          >
            <VolumeDownIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t('toolbar.power')}
            disabled={disabled}
            onClick={() => pressKey(ANDROID_KEYCODE.power)}
          >
            <PowerIcon />
          </ToolbarIconButton>
          <ToolbarDivider />
          <ToolbarIconButton
            label={t('toolbar.capture')}
            disabled={disabled || !canvas}
            onClick={() => void capture.open()}
          >
            <CameraIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={recorder.recording ? t('toolbar.stopRecording') : t('toolbar.record')}
            disabled={disabled}
            pressed={recorder.recording}
            onClick={() => void recorder.toggle()}
          >
            <RecordIcon recording={recorder.recording} />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t('toolbar.fullscreen')}
            disabled={disabled}
            onClick={onFullscreen}
          >
            <FullscreenIcon />
          </ToolbarIconButton>
          <ToolbarDivider />
          <ToolbarIconButton
            label={t('toolbar.installApk')}
            disabled={disabled || apk.installing}
            onClick={() => void apk.install()}
          >
            <ApkIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={t('toolbar.settings')}
            disabled={disabled}
            onClick={onOpenSettings}
          >
            <SettingsIcon />
          </ToolbarIconButton>
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
  readonly label: string;
  readonly disabled?: boolean;
  readonly pressed?: boolean;
  readonly onClick: () => void;
  readonly children: ReactNode;
};

function ToolbarIconButton({
  label,
  disabled = false,
  pressed,
  onClick,
  children,
}: ToolbarIconButtonProps): JSX.Element {
  return (
    <Button
      icon
      variant="toolbar"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function ToolbarDivider(): JSX.Element {
  return (
    <div role="separator" aria-orientation="vertical" className="mx-1 h-4 w-px bg-mirror-line" />
  );
}

const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function CameraIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function RecordIcon({ recording }: { readonly recording: boolean }): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8" />
      <circle
        cx="12"
        cy="12"
        r="4"
        className={cx(recording ? 'fill-red-500 stroke-red-500' : 'fill-current stroke-none')}
      />
    </svg>
  );
}

function FullscreenIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

function VolumeUpIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

function VolumeDownIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

function PowerIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  );
}

function ApkIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function SettingsIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}
