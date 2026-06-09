import { useEffect } from 'react';
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
        aria-labelledby="capture-preview-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className={styles.header}>
          <h2 id="capture-preview-title" className={styles.title}>
            Capture
          </h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className={styles.preview}>
          <img src={imageUrl} alt="Capture preview" className={styles.image} />
        </div>

        <footer className={styles.footer}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={onCopy} disabled={busy}>
            Copy
          </button>
          <button type="button" className={styles.primaryBtn} onClick={onSave} disabled={busy}>
            Save…
          </button>
        </footer>
      </div>
    </div>
  );
}
