import { useCallback, useEffect, useState } from 'react';
import { DeviceList } from './features/device/DeviceList';
import { selectConnectedDevices } from './features/device/connected-devices';
import { useDevices } from './features/device/useDevices';
import { useMirrorStatus } from './features/mirror/useMirrorStatus';
import { getManoloApi } from './shared/manolo-api';
import styles from './App.module.css';

export default function App(): JSX.Element {
  const { devices, loading, error, refresh } = useDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);
  const { activeDeviceIds, refreshStatus } = useMirrorStatus();

  const connectedDevices = selectConnectedDevices(devices);
  const pendingDevices = devices.filter((device) => device.status !== 'device');
  const selectedDevice = connectedDevices.find((device) => device.id === selectedDeviceId) ?? null;

  useEffect(() => {
    if (connectedDevices.length === 0) {
      setSelectedDeviceId(null);
      return;
    }
    const stillSelected = connectedDevices.some((device) => device.id === selectedDeviceId);
    if (!stillSelected) {
      setSelectedDeviceId(connectedDevices[0]?.id ?? null);
    }
  }, [connectedDevices, selectedDeviceId]);

  const handleStartMirror = useCallback(
    async (deviceId: string): Promise<void> => {
      const api = getManoloApi();
      if (!api) {
        setWindowError('Unable to start Manolo Mirror.');
        return;
      }

      const device = connectedDevices.find((d) => d.id === deviceId);
      const label = device?.model ?? deviceId;
      setSelectedDeviceId(deviceId);
      setWindowError(null);

      const result = await api.openMirrorWindow(deviceId, label);
      if (!result.ok) {
        setWindowError(result.error);
      }
      await refreshStatus();
    },
    [connectedDevices, refreshStatus],
  );

  const displayError = windowError ?? error;

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.brand}>
            <img src="/manolo-logo.svg" alt="" className={styles.logo} width={28} height={28} />
            <h1 className={styles.title}>Manolo Mirror</h1>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.panel}>
          <div className={styles.panelHeader}>
            {selectedDevice ? (
              <div className={styles.selectionBlock}>
                <span className={styles.selectionLabel}>Selected</span>
                <strong className={styles.selectionTitle}>
                  {selectedDevice.model ?? selectedDevice.id}
                </strong>
              </div>
            ) : (
              <div className={styles.selectionBlock}>
                <span className={styles.selectionLabel}>Selected</span>
                <span className={styles.selectionEmpty}>Choose a device to start a mirror session</span>
              </div>
            )}
            {selectedDevice && (
              <span className={styles.selectionMeta}>{selectedDevice.product ?? selectedDevice.id}</span>
            )}
          </div>

          <DeviceList
            devices={devices}
            loading={loading}
            error={displayError}
            readyCount={connectedDevices.length}
            liveCount={activeDeviceIds.length}
            issueCount={pendingDevices.length}
            selectedDeviceId={selectedDeviceId}
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
