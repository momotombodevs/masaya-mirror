import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { cx } from './cx';

export type MenuItem = {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  /** Draws a divider above this item. */
  readonly separatorBefore?: boolean;
};

type MenuProps = {
  /** Accessible name of the button that opens the menu. */
  readonly label: string;
  /** Icon shown in that button. */
  readonly children: ReactNode;
  readonly items: readonly MenuItem[];
  readonly disabled?: boolean;
};

/** Toolbar button that opens a dark dropdown. Escape, a click outside or picking an item closes it. */
export function Menu({ label, children, items, disabled = false }: MenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const onPointerDown = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        icon
        variant="toolbar"
        title={label}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
      >
        {children}
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full z-50 mt-1 min-w-[210px] rounded-panel border border-mirror-line bg-mirror-bar py-1 text-mirror-text shadow-sheet"
        >
          {items.map((item) => (
            <div key={item.label}>
              {item.separatorBefore && (
                <div role="separator" className="my-1 h-px bg-mirror-line" />
              )}
              <button
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className={cx(
                  'flex w-full items-center px-3 py-1.5 text-left text-base',
                  'enabled:hover:bg-mirror-hover disabled:opacity-40',
                )}
              >
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
