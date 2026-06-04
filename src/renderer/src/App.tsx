import { useCallback, useEffect, useState } from 'react';
import { DeviceList } from './features/device/DeviceList';
import { useDevices } from './features/device/useDevices';
import { useMirror } from './features/mirror/useMirror';
import styles from './App.module.css';

function getManoloApi(): Window['manolo'] | undefined {
  return typeof window !== 'undefined' ? window.manolo : undefined;
}

export default function App() {
  const { devices, loading, error, refresh } = useDevices();
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);
  const mirror = useMirror(null);

  const connectedDevices = devices.filter((device) => device.status === 'device');

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
      await mirror.refreshStatus();
    },
    [connectedDevices, mirror],
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
          activeMirrorIds={mirror.activeDeviceIds}
        />
      </main>
    </div>
  );
}
