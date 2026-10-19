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
        'h-7 max-w-[220px] rounded-control border border-line bg-fill px-2 text-base text-ink shadow-control disabled:opacity-40',
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
  );
}
