import { cx } from './cx';

type ToggleProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Accessible name; the visible label usually sits next to the control. */
  readonly label: string;
  readonly disabled?: boolean;
};

/** On/off switch. */
export function Toggle({ checked, onChange, label, disabled = false }: ToggleProps): JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 disabled:opacity-40',
        checked ? 'bg-accent' : 'bg-ink-3/40',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-control transition-transform duration-150',
          checked && 'translate-x-4',
        )}
      />
    </button>
  );
}
