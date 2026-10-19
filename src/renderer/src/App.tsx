import { useCallback, useState } from 'react';
import { DeviceList } from './features/device/DeviceList';
import { summarizeDevices } from './features/device/connected-devices';
import { useDevices } from './features/device/useDevices';
import { useMirrorStatus } from './features/mirror/useMirrorStatus';
import { getManoloApi } from './shared/manolo-api';
import styles from './App.module.css';

export default function App(): JSX.Element {
  const { devices, loading, error, refresh } = useDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);
  const { activeDeviceIds, refreshStatus } = useMirrorStatus();

  const { connected, unavailable, liveCount } = summarizeDevices(devices, activeDeviceIds);
  const selectedDevice =
    connected.find((device) => device.id === selectedDeviceId) ?? connected[0] ?? null;

  const handleStartMirror = useCallback(
    async (deviceId: string): Promise<void> => {
      const api = getManoloApi();
      if (!api) {
        setWindowError('Unable to start Manolo Mirror.');
        return;
      }

      const device = connected.find((d) => d.id === deviceId);
      const label = device?.model ?? deviceId;
      setSelectedDeviceId(deviceId);
      setWindowError(null);

      const result = await api.openMirrorWindow(deviceId, label);
      if (!result.ok) {
        setWindowError(result.error);
      }
      await refreshStatus();
    },
    [connected, refreshStatus],
  );

  const displayError = windowError ?? error;
  const summaryLabel = selectedDevice ? selectedDevice.model ?? selectedDevice.id : 'No device selected';
  const summaryMeta = selectedDevice ? selectedDevice.product ?? selectedDevice.id : 'Connect a device to start mirroring';
  const summaryStats = [
    { label: 'Ready', value: connected.length },
    { label: 'Live', value: liveCount },
    { label: 'Issues', value: unavailable.length },
  ];

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <img src="/manolo-logo.svg" alt="" className={styles.logo} width={28} height={28} />
            <div className={styles.brandCopy}>
              <h1 className={styles.title}>Manolo Mirror</h1>
              <p className={styles.subtitle}>Android QA workspace</p>
            </div>
          </div>

          <div className={styles.summary}>
            <div className={styles.summaryBlock}>
              <span className={styles.summaryLabel}>Selected</span>
              <strong className={styles.summaryTitle}>{summaryLabel}</strong>
              <span className={styles.summaryMeta}>{summaryMeta}</span>
            </div>
            <div className={styles.summaryStats} aria-label="Device summary">
              {summaryStats.map((stat) => (
                <span key={stat.label} className={styles.summaryPill}>
                  <strong>{stat.value}</strong> {stat.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.panel}>
          <DeviceList
            loading={loading}
            error={displayError}
            summary={{ connected, unavailable, liveCount }}
            selectedDeviceId={selectedDevice?.id ?? null}
            onSelectDevice={setSelectedDeviceId}
            onRefresh={() => void refresh()}
            onStartMirror={(id) => void handleStartMirror(id)}
            activeMirrorIds={activeDeviceIds}
          />
        </div>
      </main>
    </div>
  );
}
