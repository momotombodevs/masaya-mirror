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
  const { connected, unavailable, liveCount } = summary;

  return (
    <section className="flex flex-col gap-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dispositivos</h1>
          <p className="text-sm text-ink-2">
            {connected.length === 0
              ? 'Ninguno conectado'
              : `${connected.length} conectado${connected.length === 1 ? '' : 's'} · ${liveCount} en espejo`}
          </p>
        </div>
        <Button variant="plain" icon onClick={onRefresh} disabled={loading} aria-label="Actualizar">
          <RefreshIcon spinning={loading} />
        </Button>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-panel border border-danger/30 bg-danger/10 px-4 py-3">
          <div className="min-w-0">
            <p className="font-medium text-danger">Problema de conexión</p>
            <p className="text-sm text-ink-2">{error}</p>
            <p className="text-sm text-ink-2">Revisa adb, reconecta el dispositivo y reintenta.</p>
          </div>
          <Button onClick={onRefresh} disabled={loading}>
            Reintentar
          </Button>
        </div>
      )}

      {!error && !loading && connected.length === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-panel border border-line bg-content px-6 py-12 text-center">
          <PhoneIcon className="size-8 text-ink-3" />
          <div>
            <p className="font-medium">No hay dispositivos conectados</p>
            <p className="text-sm text-ink-2">
              Conecta un dispositivo por USB, activa la depuración y actualiza.
            </p>
          </div>
          <Button onClick={onRefresh}>Actualizar</Button>
        </div>
      )}

      {connected.length > 0 && (
        <DeviceGroup>
          {connected.map((device) => {
            const isMirroring = activeMirrorIds.includes(device.id);
            return (
              <DeviceRow
                key={device.id}
                device={device}
                status={<StatusDot tone={isMirroring ? 'success' : 'idle'} label={isMirroring ? 'En espejo' : 'Listo'} />}
                action={
                  <Button aria-label={`Abrir espejo de ${device.model ?? device.id}`} onClick={() => onStartMirror(device.id)}>
                    Abrir
                  </Button>
                }
              />
            );
          })}
        </DeviceGroup>
      )}

      {unavailable.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h2 className="px-1 text-sm font-medium text-ink-2">No disponibles</h2>
          <DeviceGroup>
            {unavailable.map((device) => (
              <DeviceRow
                key={device.id}
                device={device}
                status={<StatusDot tone="warning" label={DEVICE_STATUS_LABELS[device.status]} />}
              />
            ))}
          </DeviceGroup>
        </div>
      )}
    </section>
  );
}

function DeviceGroup({ children }: { readonly children: ReactNode }): JSX.Element {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-panel border border-line bg-content">
      {children}
    </ul>
  );
}

type DeviceRowProps = {
  readonly device: AndroidDevice;
  readonly status: ReactNode;
  readonly action?: ReactNode;
};

function DeviceRow({ device, status, action }: DeviceRowProps): JSX.Element {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      <PhoneIcon className="size-5 shrink-0 text-ink-3" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{device.model ?? device.id}</p>
        <p className="truncate text-sm text-ink-2">
          {[device.product, device.id].filter(Boolean).join(' · ')}
        </p>
      </div>
      {status}
      {action}
    </li>
  );
}

function PhoneIcon({ className }: { readonly className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}

function RefreshIcon({ spinning }: { readonly spinning: boolean }): JSX.Element {
  return (
    <svg className={spinning ? 'size-4 animate-spin' : 'size-4'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
    </svg>
  );
}
