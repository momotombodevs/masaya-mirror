import type { AndroidDevice } from '../../../../shared/device/types';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { cx } from '../../components/ui/cx';
import type { DeviceSummary } from './connected-devices';
import { DEVICE_STATUS_LABELS } from './device.ui';

type DeviceListProps = {
  readonly summary: DeviceSummary;
  readonly loading: boolean;
  readonly error: string | null;
  readonly selectedDeviceId: string | null;
  readonly onSelectDevice: (deviceId: string) => void;
  readonly onRefresh: () => void;
  readonly onStartMirror: (deviceId: string) => void;
  readonly activeMirrorIds: readonly string[];
};

const ROW_BORDER = 'rounded-md border border-line-subtle transition-colors duration-150';
const DEVICE_ROW =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-md:grid-cols-1';
const IDENTITY_GRID =
  'grid min-w-0 grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_auto] items-center gap-3 max-md:grid-cols-1 max-md:gap-2';

export function DeviceList({
  summary,
  loading,
  error,
  selectedDeviceId,
  onSelectDevice,
  onRefresh,
  onStartMirror,
  activeMirrorIds,
}: DeviceListProps): JSX.Element {
  const { connected, unavailable, liveCount } = summary;

  return (
    <section className="w-full min-w-0">
      <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-5 max-md:flex-col">
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold leading-tight tracking-tight">Devices</h2>
          <div className="flex flex-wrap gap-2" aria-label="Device summary">
            <Chip className="font-normal">{connected.length} ready</Chip>
            <Chip className="font-normal">{liveCount} live</Chip>
            <Chip className="font-normal">{unavailable.length} issues</Chip>
          </div>
        </div>
        <Button icon onClick={onRefresh} disabled={loading} aria-label="Refresh devices">
          {loading ? '…' : '↻'}
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="mx-5 mb-4 flex items-center justify-between gap-4 rounded-lg border border-danger-border/75 bg-danger-bg/70 p-4 max-md:flex-col max-md:items-start"
        >
          <div className="flex min-w-0 flex-col gap-1">
            <strong className="text-sm font-semibold">Connection problem</strong>
            <p className="text-sm text-danger-text">{error}</p>
            <p className="text-sm text-ink-secondary">Check adb, reconnect the device, then retry.</p>
          </div>
          <Button variant="danger" className="max-md:w-full" onClick={onRefresh} disabled={loading}>
            Retry
          </Button>
        </div>
      )}

      {!error && !loading && connected.length === 0 && (
        <div className="mx-5 mb-4 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-line-subtle bg-surface-2/70 p-4 max-md:grid-cols-1">
          <strong className="text-sm font-semibold">No connected devices</strong>
          <p className="text-sm text-ink-secondary">
            Connect a device over USB, allow debugging, then refresh.
          </p>
          <Button className="max-md:w-full" onClick={onRefresh}>
            Refresh
          </Button>
        </div>
      )}

      <ul className="grid gap-2 px-5 pb-4">
        {connected.map((device) => {
          const isSelected = selectedDeviceId === device.id;
          const isMirroring = activeMirrorIds.includes(device.id);
          const label = device.model ?? device.id;

          return (
            <li
              key={device.id}
              className={cx(
                ROW_BORDER,
                DEVICE_ROW,
                isSelected
                  ? 'border-brand/35 bg-selected/70 shadow-[inset_2px_0_0_theme(colors.brand)]'
                  : 'bg-surface-1 hover:border-line',
              )}
            >
              <button
                type="button"
                className={cx(
                  IDENTITY_GRID,
                  'w-full cursor-pointer rounded-md border-0 bg-transparent px-4 py-3 text-left text-ink hover:bg-hover/65 max-md:p-3',
                )}
                aria-pressed={isSelected}
                onClick={() => onSelectDevice(device.id)}
              >
                <DeviceIdentity device={device} />
                <Chip tone={isMirroring ? 'success' : 'neutral'} className="justify-self-end max-md:justify-self-start">
                  {isMirroring ? 'Live' : 'Ready'}
                </Chip>
              </button>
              <Button
                className="mr-3 gap-1 max-md:mx-3 max-md:mb-3 max-md:w-[calc(100%-1.5rem)]"
                title="Open mirror"
                aria-label={`Open mirror for ${label}`}
                onClick={() => onStartMirror(device.id)}
              >
                <span>Open</span>
                <PlayIcon />
              </Button>
            </li>
          );
        })}
      </ul>

      {unavailable.length > 0 && (
        <div className="px-5 pb-5 pt-1">
          <div className="mb-2 text-xs font-medium tracking-wide text-ink-tertiary">Unavailable</div>
          <ul className="grid gap-2">
            {unavailable.map((device) => (
              <li
                key={device.id}
                className={cx(ROW_BORDER, IDENTITY_GRID, 'bg-surface-3/70 px-4 py-3 max-md:p-3')}
              >
                <DeviceIdentity device={device} />
                <Chip tone="warning" className="justify-self-end max-md:justify-self-start">
                  {DEVICE_STATUS_LABELS[device.status]}
                </Chip>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Name, product and id columns shared by available and unavailable rows. */
function DeviceIdentity({ device }: { readonly device: AndroidDevice }): JSX.Element {
  return (
    <>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-md font-semibold">{device.model ?? device.id}</span>
        <span className="truncate text-sm text-ink-secondary">{device.product ?? device.id}</span>
      </span>
      <span className="truncate text-sm text-ink-tertiary">{device.id}</span>
    </>
  );
}

function PlayIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l8.5-5.5z" />
    </svg>
  );
}
