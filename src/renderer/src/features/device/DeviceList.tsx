import type { ReactNode } from 'react';
import type { AndroidDevice } from '../../../../shared/device/types';
import { Button } from '../../components/ui/Button';
import { StatusDot } from '../../components/ui/StatusDot';
import type { DeviceSummary } from './connected-devices';
import { DEVICE_STATUS_LABELS } from './device.ui';

type DeviceListProps = {
  readonly summary: DeviceSummary;
  readonly loading: boolean;
  readonly error: string | null;
  readonly activeMirrorIds: readonly string[];
  readonly onRefresh: () => void;
  readonly onStartMirror: (deviceId: string) => void;
};

export function DeviceList({
  summary,
  loading,
  error,
  activeMirrorIds,
  onRefresh,
  onStartMirror,
}: DeviceListProps): JSX.Element {
  const { connected, unavailable } = summary;
  const modelCounts = countModels([...connected, ...unavailable]);

  return (
    <section>
      {error && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5"
        >
          <p className="min-w-0 text-danger">{error}</p>
          <Button onClick={onRefresh} disabled={loading}>
            Reintentar
          </Button>
        </div>
      )}

      {!error && !loading && connected.length === 0 && unavailable.length === 0 && (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center">
          <PhoneIcon className="size-8 text-ink-3" />
          <p className="font-medium">Sin dispositivos</p>
          <p className="text-ink-2">Conecta un teléfono por USB.</p>
        </div>
      )}

      {connected.length > 0 && (
        <ul>
          {connected.map((device) => {
            const isMirroring = activeMirrorIds.includes(device.id);
            return (
              <DeviceRow
                key={device.id}
                device={device}
                showId={isAmbiguous(device, modelCounts)}
                status={isMirroring ? <StatusDot tone="success" label="En espejo" /> : null}
                onOpen={() => onStartMirror(device.id)}
              />
            );
          })}
        </ul>
      )}

      {unavailable.length > 0 && (
        <>
          <h2 className="border-b border-line px-4 pb-1.5 pt-4 text-sm font-medium text-ink-2">
            No disponibles
          </h2>
          <ul>
            {unavailable.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                showId={isAmbiguous(device, modelCounts)}
                status={<StatusDot tone="warning" label={DEVICE_STATUS_LABELS[device.status]} />}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function countModels(devices: readonly AndroidDevice[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const device of devices) {
    const name = device.model ?? device.id;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

/** The raw adb id is only shown when the model alone cannot tell two devices apart. */
function isAmbiguous(device: AndroidDevice, modelCounts: ReadonlyMap<string, number>): boolean {
  return device.model !== undefined && (modelCounts.get(device.model) ?? 0) > 1;
}

type DeviceRowProps = {
  readonly device: AndroidDevice;
  readonly showId: boolean;
  readonly status: ReactNode;
  readonly onOpen?: () => void;
};

function DeviceRow({ device, showId, status, onOpen }: DeviceRowProps): JSX.Element {
  const name = device.model ?? device.id;

  return (
    <li
      className={`group flex items-center gap-3 border-b border-line px-4 py-2.5 ${onOpen ? 'hover:bg-hover' : 'text-ink-2'}`}
      onDoubleClick={onOpen}
    >
      <PhoneIcon className="size-5 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <p className="truncate">{name}</p>
        {showId && <p className="truncate text-sm text-ink-3">{device.id}</p>}
      </div>
      {status}
      {onOpen && (
        <Button
          className="opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
          aria-label={`Abrir ${name}`}
          onClick={onOpen}
        >
          Abrir
        </Button>
      )}
    </li>
  );
}

function PhoneIcon({ className }: { readonly className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}
