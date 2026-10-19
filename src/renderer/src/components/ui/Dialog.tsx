import { useEffect, useId, type ReactNode } from 'react';

type DialogProps = {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
};

/** Modal sheet. Escape and a click outside close it. */
export function Dialog({ title, onClose, children, footer }: DialogProps): JSX.Element {
  const titleId = useId();

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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-[min(440px,100%)] flex-col overflow-hidden rounded-2xl border border-line/70 bg-content text-ink shadow-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="px-4 pb-2 pt-4 text-center text-lg font-semibold">
          {title}
        </h2>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
        {footer && (
          <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
