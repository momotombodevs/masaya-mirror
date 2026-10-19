import { useEffect } from 'react';
import { Button } from '../../components/ui/Button';

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
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(90vh,820px)] w-[min(440px,100%)] flex-col overflow-hidden rounded-xl border border-line bg-content text-ink shadow-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="capture-preview-title" className="px-4 pb-2 pt-4 text-center text-lg font-semibold">
          Captura
        </h2>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 pb-4">
          <img
            src={imageUrl}
            alt="Vista previa de la captura"
            className="h-auto max-h-[min(60vh,640px)] w-auto max-w-full rounded-control border border-line"
          />
        </div>

        <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <Button onClick={onClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={onCopy} disabled={busy}>
            Copiar
          </Button>
          <Button variant="primary" onClick={onSave} disabled={busy}>
            Guardar…
          </Button>
        </footer>
      </div>
    </div>
  );
}
