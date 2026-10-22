import type { ReactNode } from 'react';
import type { AndroidDevice } from '../../../../shared/device/types';
import { Button } from '../../components/ui/Button';
import { GROUPED_CARD_CLASSES } from '../../components/ui/card';
import { PhoneIcon } from '../../components/ui/icons';
import { StatusDot } from '../../components/ui/StatusDot';
import type { DeviceSummary } from './connected-devices';
import { isWifiDeviceId } from '../../../../shared/ipc/validators';
import { useI18n } from '../../shared/i18n';
import { DEVICE_STATUS_LABEL_KEYS } from './device.ui';

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
          <PhoneIcon className="size-8 text-ink-3" />
          <p className="font-medium">{t('devices.none')}</p>
          <p className="text-ink-2">{t('devices.noneHint')}</p>
          <Button onClick={onConnectWifi}>{t('devices.connectWifi')}</Button>
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
          <Button variant="plain" className="text-accent" onClick={onConnectWifi}>
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
      className={`group flex min-h-[48px] items-center gap-3 px-4 py-2 ${onOpen ? 'hover:bg-hover' : 'text-ink-2'}`}
      onDoubleClick={onOpen}
    >
      <PhoneIcon className="size-5 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <p className="truncate">{name}</p>
        {showId && <p className="truncate text-sm text-ink-3">{device.id}</p>}
      </div>
      {status}
      {onDisconnect && (
        <Button
          variant="plain"
          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={t('devices.disconnectNamed', { name })}
          onClick={onDisconnect}
        >
          {t('devices.disconnect')}
        </Button>
      )}
      {onOpen && (
        <Button
          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={t('devices.openNamed', { name })}
          onClick={onOpen}
        >
          {t('devices.open')}
        </Button>
      )}
    </li>
  );
}
