import { useEffect } from 'react';
import ui from '../../components/ui/primitives.module.css';
import styles from './CapturePreviewDialog.module.css';

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
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="capture-preview-title" className={styles.title}>
            Capture
          </h2>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonGhost} ${ui.iconButton} ${styles.closeBtn}`}
            onClick={onClose}
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </header>

        <div className={styles.preview}>
          <img src={imageUrl} alt="Capture preview" className={styles.image} />
        </div>

        <footer className={styles.footer}>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary} ${styles.dialogButton}`}
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonSecondary} ${styles.dialogButton}`}
            onClick={onCopy}
            disabled={busy}
          >
            <CopyIcon />
            <span>Copy</span>
          </button>
          <button
            type="button"
            className={`${ui.button} ${ui.buttonPrimary} ${styles.dialogButton}`}
            onClick={onSave}
            disabled={busy}
          >
            <SaveIcon />
            <span>Save…</span>
          </button>
        </footer>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg className={styles.closeIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8M7 3v5h8" />
    </svg>
  );
}
