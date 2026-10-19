import { type ReactNode } from 'react';
import type { CaptureAction } from '../../../../shared/preferences/types';
import { Button } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { cx } from '../../components/ui/cx';
import { CapturePreviewDialog } from './CapturePreviewDialog';
import { useCapture } from './useCapture';
import { useRecording } from './useRecording';
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
      <header className="relative flex min-h-[52px] shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-mirror-line bg-mirror-bar px-3 py-2 text-mirror-text">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-base font-medium">{deviceLabel}</span>
          {statusMessage && (
            <span className="whitespace-nowrap text-sm text-mirror-muted">{statusMessage}</span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <ToolbarIconButton
            label="Captura"
            disabled={disabled || !canvas}
            onClick={() => void capture.open()}
          >
            <CameraIcon />
          </ToolbarIconButton>
          <ToolbarIconButton
            label={recorder.recording ? 'Detener grabación' : 'Grabar'}
            disabled={disabled}
            pressed={recorder.recording}
            onClick={() => void recorder.toggle()}
          >
            <RecordIcon recording={recorder.recording} />
          </ToolbarIconButton>
          <ToolbarIconButton label="Pantalla completa" disabled={disabled} onClick={onFullscreen}>
            <FullscreenIcon />
          </ToolbarIconButton>
          <Menu
            label="Más opciones"
            disabled={disabled}
            items={[
              { label: 'Subir volumen', onSelect: () => pressKey(ANDROID_KEYCODE.volumeUp) },
              { label: 'Bajar volumen', onSelect: () => pressKey(ANDROID_KEYCODE.volumeDown) },
              {
                label: 'Encender o apagar pantalla',
                onSelect: () => pressKey(ANDROID_KEYCODE.power),
              },
              {
                label: 'Instalar APK…',
                onSelect: () => void apk.install(),
                disabled: apk.installing,
                separatorBefore: true,
              },
              { label: 'Ajustes…', onSelect: onOpenSettings, separatorBefore: true },
            ]}
          >
            <MoreIcon />
          </Menu>
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

function MoreIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  );
}
