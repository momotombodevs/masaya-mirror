import { useState } from 'react';
import { AdbSetupPanel } from './features/device/AdbSetupPanel';
import { DeviceList } from './features/device/DeviceList';
import { WifiConnectDialog } from './features/device/WifiConnectDialog';
import { summarizeDevices } from './features/device/connected-devices';
import { DEVICE_REFRESH_MS, useDevices } from './features/device/useDevices';
import { useMirrorStatus } from './features/mirror/useMirrorStatus';
import { useI18n } from './shared/i18n';
import { callApi } from './shared/manolo-api';
import { useAutoRefresh } from './shared/useAutoRefresh';
import { useMenuActions } from './shared/useMenuAction';

export default function App(): JSX.Element {
  const { t } = useI18n();
  const { devices, loading, error, errorCode, refresh } = useDevices();
  const [windowError, setWindowError] = useState<string | null>(null);
  const [wifiOpen, setWifiOpen] = useState(false);
  const { activeDeviceIds, refreshStatus } = useMirrorStatus();

  const summary = summarizeDevices(devices);
  useMenuActions({ refresh: () => void refresh(), wifi: () => setWifiOpen(true) });
  // "Mirroring" badges follow mirror windows opened or closed since the last look.
  useAutoRefresh(() => void refreshStatus(), DEVICE_REFRESH_MS);

  const handleStartMirror = async (deviceId: string): Promise<void> => {
    const device = summary.connected.find((d) => d.id === deviceId);
    setWindowError(null);

    const result = await callApi(
      (api) => api.openMirrorWindow(deviceId, device?.model ?? deviceId),
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
        <AdbSetupPanel
          retrying={loading}
          onRetry={() => void refresh()}
          onResolved={() => void refresh()}
        />
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
        <WifiConnectDialog
          onClose={() => setWifiOpen(false)}
          onConnected={() => void refresh({ silent: true })}
        />
      )}
    </main>
  );
}
