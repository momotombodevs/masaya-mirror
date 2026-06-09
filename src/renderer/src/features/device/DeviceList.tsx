import type { AndroidDevice } from '../../../../shared/device/types';
import { selectConnectedDevices } from './connected-devices';
import { DEVICE_STATUS_LABELS } from './device.ui';
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
            className={styles.refreshBtn}
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh devices"
          >
            {loading ? '…' : '↻'}
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className={styles.recovery}>
          <div className={styles.recoveryBody}>
            <strong className={styles.recoveryTitle}>Connection problem</strong>
            <p className={styles.recoveryText}>{error}</p>
            <p className={styles.recoveryHint}>Check adb, reconnect the device, then retry.</p>
          </div>
          <button type="button" className={styles.recoveryButton} onClick={onRefresh} disabled={loading}>
            Retry
          </button>
        </div>
      )}

      {!error && !loading && connected.length === 0 && (
        <div className={styles.emptyState}>
          <strong className={styles.emptyTitle}>No connected devices</strong>
          <p className={styles.emptyText}>Connect a device over USB, allow debugging, then refresh.</p>
          <button type="button" className={styles.recoveryButton} onClick={onRefresh}>
            Refresh
          </button>
        </div>
      )}

      {(connected.length > 0 || pendingDevices.length > 0) && (
        <div className={styles.columns} aria-hidden="true">
          <span>Device</span>
          <span>Product</span>
          <span>Status</span>
          <span className={styles.columnAction}>Action</span>
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
                <span className={styles.deviceCell}>
                  <span className={styles.deviceName}>{label}</span>
                  <span className={styles.deviceId}>{device.id}</span>
                </span>
                <span className={styles.productCell}>{device.product ?? '—'}</span>
                <span className={`${styles.statusCell} ${isMirroring ? styles.statusLive : styles.statusReady}`}>
                  {statusLabel}
                </span>
              </button>
              <button
                type="button"
                className={`${styles.mirrorBtn} ${isMirroring ? styles.mirrorActive : ''}`}
                title="Open mirror"
                aria-label={`Open mirror for ${label}`}
                onClick={() => onStartMirror(device.id)}
              >
                <span>{isMirroring ? 'Open' : 'Open'}</span>
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
                <span className={styles.deviceCell}>
                  <span className={styles.deviceName}>{device.model ?? device.id}</span>
                  <span className={styles.deviceId}>{device.id}</span>
                </span>
                <span className={styles.productCell}>{device.product ?? '—'}</span>
                <span className={`${styles.statusCell} ${styles.statusIssue}`}>
                  {DEVICE_STATUS_LABELS[device.status]}
                </span>
                <span className={styles.otherAction}>—</span>
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
