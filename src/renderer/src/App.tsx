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
        setWindowError('No se pudo iniciar Manolo Mirror.');
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
        <div className={styles.brand}>
          <img src="/manolo-logo.svg" alt="" className={styles.logo} width={32} height={32} />
          <div>
            <h1 className={styles.title}>Manolo Mirror</h1>
            <p className={styles.tagline}>Tu Android en el escritorio.</p>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        <DeviceList
          devices={devices}
          loading={loading}
          error={displayError}
          selectedDeviceId={selectedDeviceId}
          onSelectDevice={setSelectedDeviceId}
          onRefresh={() => void refresh()}
          onStartMirror={(id) => void handleStartMirror(id)}
          activeMirrorIds={activeDeviceIds}
        />
      </main>
    </div>
  );
}
