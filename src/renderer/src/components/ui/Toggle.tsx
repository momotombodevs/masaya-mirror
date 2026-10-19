import { cx } from './cx';

type ToggleProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  /** Accessible name; the visible label usually sits next to the control. */
  readonly label: string;
  readonly disabled?: boolean;
};

/** On/off switch in the iOS style: a green track and a white knob that slides over it. */
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
        'relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-40',
        checked ? 'bg-success' : 'bg-ink-3/35',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'absolute left-0.5 top-0.5 size-[22px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.25)] transition-transform duration-200',
          checked && 'translate-x-[18px]',
        )}
      />
    </button>
  );
}
