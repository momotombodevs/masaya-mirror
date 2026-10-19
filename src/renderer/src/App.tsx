import { useCallback, useState } from 'react';
import { DeviceList } from './features/device/DeviceList';
import { summarizeDevices } from './features/device/connected-devices';
import { useDevices } from './features/device/useDevices';
import { useMirrorStatus } from './features/mirror/useMirrorStatus';
import { getManoloApi } from './shared/manolo-api';
import { Chip } from './components/ui/Chip';

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
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line-subtle bg-surface-1/75 px-6 pb-4 pt-5 max-sm:p-4">
        <div className="mx-auto flex max-w-layout items-center justify-between gap-6 max-lg:flex-col max-lg:items-start">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/manolo-logo.svg" alt="" className="size-7 rounded-md" width={28} height={28} />
            <div className="flex min-w-0 flex-col gap-px">
              <h1 className="text-lg font-semibold leading-tight tracking-tight">Manolo Mirror</h1>
              <p className="text-xs text-ink-secondary">Android QA workspace</p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-4 max-lg:w-full max-lg:justify-between max-sm:flex-col max-sm:items-start max-sm:gap-3">
            <div className="flex min-w-0 flex-col gap-0.5 text-right max-lg:text-left">
              <span className="text-xs font-medium tracking-wide text-ink-tertiary">Selected</span>
              <strong className="truncate text-md font-semibold">{summaryLabel}</strong>
              <span className="truncate text-xs text-ink-secondary">{summaryMeta}</span>
            </div>
            <div
              className="flex flex-wrap items-center justify-end gap-2 max-lg:justify-start max-sm:w-full"
              aria-label="Device summary"
            >
              {summaryStats.map((stat) => (
                <Chip key={stat.label} className="gap-1 bg-surface-2/75 font-normal">
                  <strong className="font-semibold text-ink">{stat.value}</strong> {stat.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-layout flex-1 px-6 pb-10 pt-8 max-sm:p-4">
        <div className="overflow-hidden rounded-lg border border-line-subtle bg-surface-1 shadow-[0_1px_2px_rgba(24,23,21,0.035)]">
          <DeviceList
            summary={{ connected, unavailable, liveCount }}
            loading={loading}
            error={displayError}
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
