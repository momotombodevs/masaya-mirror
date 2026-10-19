import { useId, type InputHTMLAttributes } from 'react';

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  readonly label: string;
};

export function TextField({ label, ...props }: TextFieldProps): JSX.Element {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-ink-2">
        {label}
      </label>
      <input
        id={id}
        autoComplete="off"
        spellCheck={false}
        className="h-7 select-text rounded-control border border-line bg-fill px-2 text-base text-ink placeholder:text-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent/70"
        {...props}
      />
    </div>
  );
}
