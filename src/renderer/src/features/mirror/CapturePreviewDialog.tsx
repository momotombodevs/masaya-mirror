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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-mirror-canvas/70 p-6 backdrop-blur-sm" role="presentation" onClick={onClose}>
      <div
        className="flex max-h-[min(90vh,820px)] w-[min(472px,100%)] flex-col overflow-hidden rounded-lg border border-line-subtle bg-surface-1 shadow-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-line-subtle bg-surface-1/80 px-5 py-4">
          <h2 id="capture-preview-title" className="text-md font-semibold">
            Capture
          </h2>
          <Button icon variant="ghost" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </Button>
        </header>

        <div className="flex min-h-0 flex-1 items-center justify-center bg-mirror-canvas p-4">
          <img src={imageUrl} alt="Capture preview" className="h-auto max-h-[min(60vh,640px)] w-auto max-w-full rounded-sm shadow-[0_16px_44px_rgba(0,0,0,0.28)]" />
        </div>

        <footer className="flex justify-end gap-2 border-t border-line-subtle bg-surface-1/80 px-5 py-3">
          <Button
            variant="secondary"
            className="min-h-9 gap-2 px-4"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="secondary"
            className="min-h-9 gap-2 px-4"
            onClick={onCopy}
            disabled={busy}
          >
            <CopyIcon />
            <span>Copy</span>
          </Button>
          <Button
            variant="primary"
            className="min-h-9 gap-2 px-4"
            onClick={onSave}
            disabled={busy}
          >
            <SaveIcon />
            <span>Save…</span>
          </Button>
        </footer>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className="size-4 shrink-0 [stroke-linecap:round] [stroke-linejoin:round]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="size-4 shrink-0 [stroke-linecap:round] [stroke-linejoin:round]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg className="size-4 shrink-0 [stroke-linecap:round] [stroke-linejoin:round]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}
