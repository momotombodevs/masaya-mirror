import type { AndroidDevice } from '../../../../shared/device/types';
import { selectConnectedDevices } from './connected-devices';
import { DEVICE_STATUS_LABELS } from './device.ui';
import styles from './DeviceList.module.css';

type DeviceListProps = {
  readonly devices: readonly AndroidDevice[];
  readonly loading: boolean;
  readonly error: string | null;
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
  selectedDeviceId,
  onSelectDevice,
  onRefresh,
  onStartMirror,
  activeMirrorIds,
}: DeviceListProps): JSX.Element {
  const connected = selectConnectedDevices(devices);

  return (
    <section className={styles.section}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Dispositivos</h2>
          <button
            type="button"
            className={styles.refreshBtn}
            onClick={onRefresh}
            disabled={loading}
            aria-label="Actualizar lista"
          >
            {loading ? '…' : '↻'}
          </button>
        </div>

        {error && (
          <p role="alert" className={styles.error}>
            {error}
          </p>
        )}

        {!error && !loading && connected.length === 0 && (
          <p className={styles.empty}>Conecta un dispositivo por USB.</p>
        )}

        <ul className={styles.deviceList}>
          {connected.map((device) => {
            const isSelected = selectedDeviceId === device.id;
            const isMirroring = activeMirrorIds.includes(device.id);
            const label = device.model ?? device.id;

            return (
              <li key={device.id} className={styles.deviceRow}>
                <button
                  type="button"
                  className={`${styles.deviceSelect} ${isSelected ? styles.deviceSelected : ''}`}
                  onClick={() => onSelectDevice(device.id)}
                >
                  <AndroidIcon />
                  <span className={styles.deviceName}>{label}</span>
                  {isMirroring && <span className={styles.liveBadge}>En vivo</span>}
                </button>
                <button
                  type="button"
                  className={`${styles.mirrorBtn} ${isMirroring ? styles.mirrorActive : ''}`}
                  title="Abrir espejo"
                  aria-label={`Abrir espejo de ${label}`}
                  onClick={() => onStartMirror(device.id)}
                >
                  <PlayIcon />
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {devices.some((d) => d.status !== 'device') && (
        <div className={styles.otherDevices}>
          <h3 className={styles.otherTitle}>Pendientes</h3>
          <ul className={styles.otherList}>
            {devices
              .filter((d) => d.status !== 'device')
              .map((device) => (
                <li key={device.id} className={styles.otherItem}>
                  <span>{device.id}</span>
                  <span className={styles.badge}>{DEVICE_STATUS_LABELS[device.status]}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function AndroidIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85a.637.637 0 0 0-.83.22l-1.88 3.24a11.43 11.43 0 0 0-8.94 0L5.65 5.67a.643.643 0 0 0-.87-.2c-.28.18-.37.54-.22.83L6.4 9.48A8.81 8.81 0 0 0 2 14.5h20a8.81 8.81 0 0 0-4.4-5.02zM7 16.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
