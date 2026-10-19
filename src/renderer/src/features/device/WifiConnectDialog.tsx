import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useI18n } from '../../shared/i18n';
import { QrPairingPanel } from './QrPairingPanel';

type WifiConnectDialogProps = {
  readonly onClose: () => void;
  /** Called after a successful connect so the device list can refresh. */
  readonly onConnected: () => void;
};

export function WifiConnectDialog({ onClose, onConnected }: WifiConnectDialogProps): JSX.Element {
  const { t } = useI18n();
  return (
    <Dialog
      title={t('wifi.title')}
      onClose={onClose}
      footer={<Button onClick={onClose}>{t('common.close')}</Button>}
    >
      <QrPairingPanel onConnected={onConnected} />
    </Dialog>
  );
}
