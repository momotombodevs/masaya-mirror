import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { useI18n } from '../../shared/i18n';

type CapturePreviewDialogProps = {
  readonly imageUrl: string;
  readonly onCopy: () => void;
  readonly onSave: () => void;
  readonly onClose: () => void;
  readonly busy?: boolean;
};

export function CapturePreviewDialog({
  imageUrl,
  onCopy,
  onSave,
  onClose,
  busy = false,
}: CapturePreviewDialogProps) {
  const { t } = useI18n();

  return (
    <Dialog
      title={t('capture.title')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button onClick={onCopy} disabled={busy}>
            {t('capture.copy')}
          </Button>
          <Button variant="primary" onClick={onSave} disabled={busy}>
            {t('capture.save')}
          </Button>
        </>
      }
    >
      <div className="flex items-center justify-center">
        <img
          src={imageUrl}
          alt={t('capture.previewAlt')}
          className="h-auto max-h-[min(60vh,640px)] w-auto max-w-full rounded-control border border-line"
        />
      </div>
    </Dialog>
  );
}
