import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { QrPairingPanel } from './QrPairingPanel';

type WifiConnectDialogProps = {
  readonly onClose: () => void;
  /** Called after a successful connect so the device list can refresh. */
  readonly onConnected: () => void;
};

export function WifiConnectDialog({ onClose, onConnected }: WifiConnectDialogProps): JSX.Element {
  return (
    <Dialog
      title="Conectar por Wi-Fi"
      onClose={onClose}
      footer={<Button onClick={onClose}>Cerrar</Button>}
    >
      <QrPairingPanel onConnected={onConnected} />
    </Dialog>
  );
}
