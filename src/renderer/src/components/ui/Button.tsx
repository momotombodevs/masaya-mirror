import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

type ButtonVariant = 'default' | 'primary' | 'plain' | 'toolbar';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  default:
    'border border-line bg-fill text-ink shadow-control enabled:hover:bg-hover enabled:active:bg-line',
  primary:
    'border border-transparent bg-accent font-medium text-white enabled:hover:opacity-90 enabled:active:opacity-75',
  plain: 'border border-transparent text-ink-2 enabled:hover:bg-hover enabled:hover:text-ink',
  toolbar:
    'border border-transparent text-mirror-text enabled:hover:bg-mirror-hover enabled:active:bg-mirror-line',
};

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  /** Square button sized for a single icon. */
  readonly icon?: boolean;
};

export function Button({
  variant = 'default',
  icon = false,
  className,
  type = 'button',
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex h-7 items-center justify-center gap-1.5 rounded-control text-base transition duration-100 disabled:opacity-40',
        icon ? 'w-7' : 'px-3',
        VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
