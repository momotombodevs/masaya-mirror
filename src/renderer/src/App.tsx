import { lazy, Suspense, useMemo, useState } from 'react';
import { DeviceList } from './features/device/DeviceList';
import { summarizeDevices } from './features/device/connected-devices';
import { DEVICE_REFRESH_MS, useDevices } from './features/device/useDevices';
import { useMirrorStatus } from './features/mirror/useMirrorStatus';
import { useI18n } from './shared/i18n';
import { callApi } from './shared/manolo-api';
import { useAutoRefresh } from './shared/useAutoRefresh';
import { useMenuActions } from './shared/useMenuAction';

// Only needed on demand, so the Wi-Fi dialog (with the QR library) and adb setup load when shown.
const AdbSetupPanel = lazy(() =>
  import('./features/device/AdbSetupPanel').then((m) => ({ default: m.AdbSetupPanel })),
);
const WifiConnectDialog = lazy(() =>
  import('./features/device/WifiConnectDialog').then((m) => ({ default: m.WifiConnectDialog })),
);

export default function App(): JSX.Element {
  const { t } = useI18n();
  const { devices, loading, error, errorCode, refresh } = useDevices();
  const [windowError, setWindowError] = useState<string | null>(null);
  const [wifiOpen, setWifiOpen] = useState(false);
  const { activeDeviceIds, refreshStatus } = useMirrorStatus();

  const summary = useMemo(() => summarizeDevices(devices), [devices]);
  useMenuActions({ refresh: () => void refresh(), wifi: () => setWifiOpen(true) });
  // "Mirroring" badges follow mirror windows opened or closed since the last look.
  useAutoRefresh(() => void refreshStatus(), DEVICE_REFRESH_MS);

  const handleStartMirror = async (deviceId: string): Promise<void> => {
    const device = summary.connected.find((d) => d.id === deviceId);
    setWindowError(null);

    const result = await callApi(
      (api) => api.openMirrorWindow(deviceId, device?.displayName ?? deviceId),
      t('app.openMirrorFailed'),
    );
    if (!result.ok) {
      setWindowError(result.error);
    }
    await refreshStatus();
  };

  const handleDisconnect = async (deviceId: string): Promise<void> => {
    const result = await callApi((api) => api.disconnectDevice(deviceId), t('common.noBridge'));
    setWindowError(result.ok ? null : result.error);
    await refresh({ silent: true });
  };

  if (errorCode === 'ADB_NOT_FOUND') {
    return (
      <main className="min-h-screen bg-content">
        <Suspense fallback={null}>
          <AdbSetupPanel
            retrying={loading}
            onRetry={() => void refresh()}
            onResolved={() => void refresh()}
          />
        </Suspense>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <DeviceList
        summary={summary}
        loading={loading}
        error={windowError ?? error}
        activeMirrorIds={activeDeviceIds}
        onRefresh={() => void refresh()}
        onStartMirror={(id) => void handleStartMirror(id)}
        onConnectWifi={() => setWifiOpen(true)}
        onDisconnect={(id) => void handleDisconnect(id)}
      />
      {wifiOpen && (
        <Suspense fallback={null}>
          <WifiConnectDialog
            onClose={() => setWifiOpen(false)}
            onConnected={() => void refresh({ silent: true })}
          />
        </Suspense>
      )}
    </main>
  );
}
