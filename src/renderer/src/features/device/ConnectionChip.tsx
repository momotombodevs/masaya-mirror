import { UsbIcon, WifiIcon } from '../../components/ui/icons';
import type { MessageKey } from '../../../../shared/i18n/messages';
import { useI18n } from '../../shared/i18n';
import { deviceConnection, type DeviceConnection } from './device.ui';

const CONNECTIONS = {
  usb: { label: 'devices.connection.usb', icon: <UsbIcon /> },
  wifi: { label: 'devices.connection.wifi', icon: <WifiIcon /> },
  emulator: { label: 'devices.connection.emulator', icon: null },
} satisfies Record<DeviceConnection, { label: MessageKey; icon: JSX.Element | null }>;

/** Small pill that says how a device is connected: USB, Wi-Fi or emulator. */
export function ConnectionChip({ deviceId }: { readonly deviceId: string }): JSX.Element {
  const { t } = useI18n();
  const connection = CONNECTIONS[deviceConnection(deviceId)];

  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-hover px-[7px] text-xs text-ink-2">
      {connection.icon}
      {t(connection.label)}
    </span>
  );
}
