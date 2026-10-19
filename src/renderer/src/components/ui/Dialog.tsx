import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

type DialogProps = {
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
};

/**
 * Modal sheet. Escape and a click outside close it; focus stays inside while it is open and
 * returns to the control that opened it.
 */
export function Dialog({ title, onClose, children, footer }: DialogProps): JSX.Element {
  return (
    <RadixDialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[100] bg-black/30 backdrop-blur-[2px]" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[100] flex max-h-[90vh] w-[min(440px,calc(100vw-3rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-line/70 bg-content text-ink shadow-sheet"
        >
          <RadixDialog.Title className="px-4 pb-2 pt-4 text-center text-lg font-semibold">
            {title}
          </RadixDialog.Title>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
          {footer && (
            <footer className="flex justify-end gap-2 border-t border-line px-4 py-3">
              {footer}
            </footer>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
