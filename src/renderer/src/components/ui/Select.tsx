import type { SelectHTMLAttributes } from 'react';
import { cx } from './cx';

export type SelectOption<T extends string | number> = {
  readonly value: T;
  readonly label: string;
};

type SelectProps<T extends string | number> = Omit<
  SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'onChange'
> & {
  readonly value: T;
  readonly options: readonly SelectOption<T>[];
  readonly onChange: (value: T) => void;
  /** Accessible name; the visible label usually sits next to the control. */
  readonly label: string;
};

/** Native dropdown. The option list decides the value type, so numbers stay numbers. */
export function Select<T extends string | number>({
  value,
  options,
  onChange,
  label,
  className,
  ...props
}: SelectProps<T>): JSX.Element {
  return (
    <span className="relative inline-flex items-center">
      <select
        aria-label={label}
        value={String(value)}
        onChange={(event) => {
          const picked = options.find((option) => String(option.value) === event.target.value);
          if (picked) {
            onChange(picked.value);
          }
        }}
        className={cx(
          'h-7 max-w-[220px] appearance-none rounded-control border border-line bg-fill py-0 pl-2.5 pr-7 text-base text-ink shadow-control enabled:hover:bg-hover disabled:opacity-40',
          className,
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={String(option.value)}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        className="pointer-events-none absolute right-2 text-ink-3"
        width="10"
        height="14"
        viewBox="0 0 10 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M2 5.5 5 2.5l3 3M2 8.5l3 3 3-3" />
      </svg>
    </span>
  );
}
