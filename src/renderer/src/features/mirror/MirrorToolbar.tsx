import { lazy, Suspense, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import {
  ApkIcon,
  CameraIcon,
  FullscreenIcon,
  PowerIcon,
  RecordIcon,
  RotateIcon,
  SettingsIcon,
  VolumeDownIcon,
  VolumeUpIcon,
} from '../../components/ui/icons';
import { useCapture } from './useCapture';
import { useRecording } from './useRecording';
import { useI18n } from '../../shared/i18n';
import { useMenuActions } from '../../shared/useMenuAction';
import { ANDROID_KEYCODE } from './android-keycodes';
import { useApkInstall } from './useApkInstall';
import { useDeviceKeys } from './useDeviceKeys';
import { useToolbarStatus } from './useToolbarStatus';
import { callApi } from '../../shared/manolo-api';
import { usePreferences } from '../../shared/preferences';

type MirrorToolbarProps = {
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly canvas: HTMLCanvasElement | null;
  readonly onFullscreen: () => void;
  readonly onOpenSettings: () => void;
  readonly disabled?: boolean;
};

const CapturePreviewDialog = lazy(() =>
  import('./CapturePreviewDialog').then((m) => ({ default: m.CapturePreviewDialog })),
);

export function MirrorToolbar({
  deviceId,
  deviceLabel,
  canvas,
  onFullscreen,
  onOpenSettings,
  disabled = false,
}: MirrorToolbarProps): JSX.Element {
  const { t } = useI18n();
  const { preferences } = usePreferences();
  const { statusMessage, showStatus, clearStatus } = useToolbarStatus();
  const capture = useCapture(canvas, showStatus, preferences.captureAction);
  const recorder = useRecording(canvas, showStatus, preferences.recordingFormat);
  const pressKey = useDeviceKeys(deviceId, showStatus);
  const apk = useApkInstall(deviceId, showStatus, clearStatus);

  const rotate = async (): Promise<void> => {
    const result = await callApi(
      (api) => api.sendControl(deviceId, { type: 'rotate' }),
      t('common.noBridge'),
    );
    if (!result.ok) {
      showStatus(result.error);
    }
  };

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
            label={t('toolbar.rotate')}
            disabled={disabled}
            onClick={() => void rotate()}
          >
            <RotateIcon />
          </ToolbarIconButton>
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
        <Suspense fallback={null}>
          <CapturePreviewDialog
            imageUrl={capture.preview.url}
            onCopy={() => void capture.copy()}
            onSave={() => void capture.save()}
            onClose={capture.close}
            busy={capture.busy}
          />
        </Suspense>
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
