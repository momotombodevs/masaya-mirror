import type { ReactNode } from 'react';
import type { AndroidDevice } from '../../../../shared/device/types';
import { Button } from '../../components/ui/Button';
import { cx } from '../../components/ui/cx';
import { GROUPED_CARD_CLASSES } from '../../components/ui/card';
import { IconTile } from '../../components/ui/IconTile';
import { PhoneIcon } from '../../components/ui/icons';
import { StatusDot } from '../../components/ui/StatusDot';
import type { DeviceSummary } from './connected-devices';
import { isWifiDeviceId } from '../../../../shared/ipc/validators';
import { useI18n } from '../../shared/i18n';
import { ConnectionChip } from './ConnectionChip';
import { DEVICE_STATUS_LABEL_KEYS, deviceTone } from './device.ui';

type DeviceListProps = {
  readonly summary: DeviceSummary;
  readonly loading: boolean;
  readonly error: string | null;
  readonly activeMirrorIds: readonly string[];
  readonly onRefresh: () => void;
  readonly onStartMirror: (deviceId: string) => void;
  readonly onConnectWifi: () => void;
  readonly onDisconnect: (deviceId: string) => void;
};

export function DeviceList({
  summary,
  loading,
  error,
  activeMirrorIds,
  onRefresh,
  onStartMirror,
  onConnectWifi,
  onDisconnect,
}: DeviceListProps): JSX.Element {
  const { t } = useI18n();
  const { connected, unavailable } = summary;
  const nameCounts = countNames([...connected, ...unavailable]);

  return (
    <section className="flex flex-col gap-4 p-4">
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-panel bg-content px-4 py-2.5 ring-1 ring-line"
        >
          <p className="min-w-0 text-danger">{error}</p>
          <Button onClick={onRefresh} disabled={loading}>
            {t('common.retry')}
          </Button>
        </div>
      )}

      {!error && !loading && connected.length === 0 && unavailable.length === 0 && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center">
          <IconTile tone="indigo" size="lg">
            <PhoneIcon />
          </IconTile>
          <p className="mt-1.5 text-lg font-medium">{t('devices.none')}</p>
          <p className="text-ink-2">{t('devices.noneHint')}</p>
          <Button className="mt-1.5" onClick={onConnectWifi}>
            {t('devices.connectWifi')}
          </Button>
        </div>
      )}

      {connected.length > 0 && (
        <ul className={GROUPED_CARD_CLASSES}>
          {connected.map((device) => {
            const isMirroring = activeMirrorIds.includes(device.id);
            return (
              <DeviceRow
                key={device.id}
                device={device}
                showId={isAmbiguous(device, nameCounts)}
                status={
                  isMirroring ? <StatusDot tone="success" label={t('devices.mirroring')} /> : null
                }
                onOpen={() => onStartMirror(device.id)}
                onDisconnect={isWifiDeviceId(device.id) ? () => onDisconnect(device.id) : undefined}
              />
            );
          })}
        </ul>
      )}

      {unavailable.length > 0 && (
        <>
          <h2 className="-mb-2.5 px-4 text-sm uppercase tracking-wide text-ink-3">
            {t('devices.unavailable')}
          </h2>
          <ul className={GROUPED_CARD_CLASSES}>
            {unavailable.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                showId={isAmbiguous(device, nameCounts)}
                status={
                  <StatusDot tone="warning" label={t(DEVICE_STATUS_LABEL_KEYS[device.status])} />
                }
                onDisconnect={isWifiDeviceId(device.id) ? () => onDisconnect(device.id) : undefined}
              />
            ))}
          </ul>
        </>
      )}

      {(connected.length > 0 || unavailable.length > 0) && (
        <div className="flex justify-center">
          <Button variant="link" onClick={onConnectWifi}>
            {t('devices.connectWifi')}
          </Button>
        </div>
      )}
    </section>
  );
}

function countNames(devices: readonly AndroidDevice[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const device of devices) {
    const name = device.displayName ?? device.id;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/** The raw adb id is only shown when the name alone cannot tell two devices apart. */
function isAmbiguous(device: AndroidDevice, nameCounts: ReadonlyMap<string, number>): boolean {
  return device.displayName !== undefined && (nameCounts.get(device.displayName) ?? 0) > 1;
}

type DeviceRowProps = {
  readonly device: AndroidDevice;
  readonly showId: boolean;
  readonly status: ReactNode;
  readonly onOpen?: () => void;
  readonly onDisconnect?: (() => void) | undefined;
};

function DeviceRow({ device, showId, status, onOpen, onDisconnect }: DeviceRowProps): JSX.Element {
  const { t } = useI18n();
  const name = device.displayName ?? device.id;

  return (
    <li
      className={cx(
        'group relative flex min-h-[48px] items-center gap-3 px-4 py-2',
        onOpen ? 'focus-within:bg-hover hover:bg-hover' : 'text-ink-2',
      )}
      onDoubleClick={onOpen}
    >
      <IconTile
        tone={onOpen ? deviceTone(device.id) : 'gray'}
        className={onOpen ? '' : 'opacity-50'}
      >
        <PhoneIcon />
      </IconTile>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0">
          <p className="truncate">{name}</p>
          {showId && <p className="truncate text-sm text-ink-3">{device.id}</p>}
        </div>
        <ConnectionChip deviceId={device.id} />
      </div>
      {status}
      {(onOpen || onDisconnect) && (
        // The actions cover the status on hover or focus, so the status keeps its place.
        <div
          className={cx(
            'absolute inset-y-0 right-4 flex items-center gap-1 pl-3 opacity-0 transition-opacity duration-100 focus-within:opacity-100 group-hover:opacity-100',
            onOpen ? 'bg-hover' : 'bg-content',
          )}
        >
          {onDisconnect && (
            <Button
              variant="plain"
              aria-label={t('devices.disconnectNamed', { name })}
              onClick={onDisconnect}
            >
              {t('devices.disconnect')}
            </Button>
          )}
          {onOpen && (
            <Button aria-label={t('devices.openNamed', { name })} onClick={onOpen}>
              {t('devices.open')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}
