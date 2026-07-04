import type { AndroidDevice } from '../../../../shared/device/types';
import { selectConnectedDevices } from './connected-devices';
import { DEVICE_STATUS_LABELS } from './device.ui';
import ui from '../../components/ui/primitives.module.css';
import styles from './DeviceList.module.css';

type DeviceListProps = {
  readonly devices: readonly AndroidDevice[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly readyCount: number;
  readonly liveCount: number;
  readonly issueCount: number;
  readonly selectedDeviceId: string | null;
  readonly onSelectDevice: (deviceId: string) => void;
  readonly onRefresh: () => void;
  readonly onStartMirror: (deviceId: string) => void;
  readonly activeMirrorIds: readonly string[];
};

export function DeviceList({
  devices,
  loading,
  error,
  readyCount,
  liveCount,
  issueCount,
  selectedDeviceId,
  onSelectDevice,
  onRefresh,
  onStartMirror,
  activeMirrorIds,
}: DeviceListProps): JSX.Element {
  const connected = selectConnectedDevices(devices);
  const pendingDevices = devices.filter((device) => device.status !== 'device');

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div className={styles.headerLead}>
          <h2 className={styles.title}>Devices</h2>
          <div className={styles.inlineStats} aria-label="Device summary">
            <span>{readyCount} ready</span>
            <span>{liveCount} live</span>
            <span>{issueCount} issues</span>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary} ${ui.iconButton} ${styles.refreshBtn}`}
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh devices"
          >
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className={`${ui.callout} ${ui.calloutDanger} ${styles.recovery}`}>
          <div className={styles.recoveryBody}>
            <strong className={styles.recoveryTitle}>Connection problem</strong>
            <p className={styles.recoveryText}>{error}</p>
            <p className={styles.recoveryHint}>Check adb, reconnect the device, then retry.</p>
          </div>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonDanger} ${styles.recoveryButton}`}
            onClick={onRefresh}
            disabled={loading}
          >
            Retry
          </button>
        </div>
      )}

      {!error && !loading && connected.length === 0 && (
        <div className={styles.emptyState}>
          <strong className={styles.emptyTitle}>No connected devices</strong>
          <p className={styles.emptyText}>Connect a device over USB, allow debugging, then refresh.</p>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary} ${styles.recoveryButton}`}
            onClick={onRefresh}
          >
            Refresh
          </button>
        </div>
      )}

      <ul className={styles.deviceList}>
        {connected.map((device) => {
          const isSelected = selectedDeviceId === device.id;
          const isMirroring = activeMirrorIds.includes(device.id);
          const label = device.model ?? device.id;
          const statusLabel = isMirroring ? 'Live' : 'Ready';

          return (
            <li key={device.id} className={`${styles.deviceRow} ${isSelected ? styles.deviceRowSelected : ''}`}>
              <button
                type="button"
                className={styles.deviceSelect}
                onClick={() => onSelectDevice(device.id)}
              >
                <span className={styles.deviceIdentity}>
                  <span className={styles.deviceName}>{label}</span>
                  <span className={styles.deviceMeta}>{device.product ?? device.id}</span>
                </span>
                <span className={styles.deviceId}>{device.id}</span>
                <span
                  className={`${ui.chip} ${isMirroring ? ui.chipSuccess : ui.chipNeutral} ${styles.statusBadge}`}
                >
                  {statusLabel}
                </span>
              </button>
              <button
                type="button"
                className={`${ui.button} ${ui.buttonSecondary} ${styles.mirrorBtn}`}
                title="Open mirror"
                aria-label={`Open mirror for ${label}`}
                onClick={() => onStartMirror(device.id)}
              >
                <span>Open</span>
                <PlayIcon />
              </button>
            </li>
          );
        })}
      </ul>

      {pendingDevices.length > 0 && (
        <div className={styles.pendingSection}>
          <div className={styles.pendingHeader}>Unavailable</div>
          <ul className={styles.otherList}>
            {pendingDevices.map((device) => (
              <li key={device.id} className={styles.otherItem}>
                <span className={styles.deviceIdentity}>
                  <span className={styles.deviceName}>{device.model ?? device.id}</span>
                  <span className={styles.deviceMeta}>{device.product ?? device.id}</span>
                </span>
                <span className={styles.deviceId}>{device.id}</span>
                <span className={`${ui.chip} ${ui.chipWarning} ${styles.statusBadge}`}>
                  {DEVICE_STATUS_LABELS[device.status]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M9 6.5v11l8.5-5.5z" />
    </svg>
  );
}
