import { useCallback, useState } from 'react';
import { ADB_NOT_FOUND_MESSAGE } from '../../shared/device/adb';
import { AdbSetupPanel } from './features/device/AdbSetupPanel';
import { DeviceList } from './features/device/DeviceList';
import { WifiConnectDialog } from './features/device/WifiConnectDialog';
import { summarizeDevices } from './features/device/connected-devices';
import { useDevices } from './features/device/useDevices';
import { useMirrorStatus } from './features/mirror/useMirrorStatus';
import { useI18n } from './shared/i18n';
import { getManoloApi } from './shared/manolo-api';
import { useMenuActions } from './shared/useMenuAction';

export default function App(): JSX.Element {
  const { t } = useI18n();
  const { devices, loading, error, refresh } = useDevices();
  const [windowError, setWindowError] = useState<string | null>(null);
  const [wifiOpen, setWifiOpen] = useState(false);
  const { activeDeviceIds, refreshStatus } = useMirrorStatus();

  const summary = summarizeDevices(devices);
  useMenuActions({ refresh: () => void refresh(), wifi: () => setWifiOpen(true) });

  const handleStartMirror = useCallback(
    async (deviceId: string): Promise<void> => {
      const api = getManoloApi();
      if (!api) {
        setWindowError(t('app.openMirrorFailed'));
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
    [summary.connected, refreshStatus, t],
  );

  const handleDisconnect = useCallback(
    async (deviceId: string): Promise<void> => {
      const result = await getManoloApi()?.disconnectDevice(deviceId);
      setWindowError(result && !result.ok ? result.error : null);
      await refresh({ silent: true });
    },
    [refresh],
  );

  if (error === ADB_NOT_FOUND_MESSAGE) {
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
    <main className="min-h-screen bg-window">
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
