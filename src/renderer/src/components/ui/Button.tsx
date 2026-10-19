import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'mirror';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'border-action bg-action text-surface-1 enabled:hover:border-action-hover enabled:hover:bg-action-hover',
  secondary:
    'border-line-subtle bg-surface-1 text-ink enabled:hover:border-line enabled:hover:bg-hover',
  ghost:
    'border-transparent bg-transparent text-ink-secondary enabled:hover:border-line-subtle enabled:hover:bg-hover enabled:hover:text-ink',
  danger: 'border-danger-border/70 bg-danger-bg/70 text-danger-text',
  mirror:
    'border-mirror-border bg-mirror-2/70 text-mirror-text enabled:hover:border-mirror-muted/40 enabled:hover:bg-mirror-hover',
};

const ACTIVE_MIRROR_CLASSES = 'border-brand/40 bg-brand/15 text-mirror-text';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  /** Square button sized for a single icon. */
  readonly icon?: boolean;
  /** Highlights a toggled mirror button. */
  readonly active?: boolean;
};

export function Button({
  variant = 'secondary',
  icon = false,
  active = false,
  className,
  type = 'button',
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex min-h-8 cursor-pointer items-center justify-center rounded-control border text-sm font-medium leading-none transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50',
        icon ? 'size-8 p-0' : 'px-3',
        active ? ACTIVE_MIRROR_CLASSES : VARIANT_CLASSES[variant],
        className,
      )}
      {...props}
    />
  );
}
