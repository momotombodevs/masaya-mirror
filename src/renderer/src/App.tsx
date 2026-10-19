import { useCallback, useState } from 'react';
import { DeviceList } from './features/device/DeviceList';
import { summarizeDevices } from './features/device/connected-devices';
import { useDevices } from './features/device/useDevices';
import { useMirrorStatus } from './features/mirror/useMirrorStatus';
import { getManoloApi } from './shared/manolo-api';

export default function App(): JSX.Element {
  const { devices, loading, error, refresh } = useDevices();
  const [windowError, setWindowError] = useState<string | null>(null);
  const { activeDeviceIds, refreshStatus } = useMirrorStatus();

  const summary = summarizeDevices(devices, activeDeviceIds);

  const handleStartMirror = useCallback(
    async (deviceId: string): Promise<void> => {
      const api = getManoloApi();
      if (!api) {
        setWindowError('No se pudo iniciar Manolo Mirror.');
        return;
      }

      const device = summary.connected.find((d) => d.id === deviceId);
      setWindowError(null);

      const result = await api.openMirrorWindow(deviceId, device?.model ?? deviceId);
      if (!result.ok) {
        setWindowError(result.error);
      }
      await refreshStatus();
    },
    [summary.connected, refreshStatus],
  );

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-6">
      <DeviceList
        summary={summary}
        loading={loading}
        error={windowError ?? error}
        activeMirrorIds={activeDeviceIds}
        onRefresh={() => void refresh()}
        onStartMirror={(id) => void handleStartMirror(id)}
      />
    </main>
  );
}
