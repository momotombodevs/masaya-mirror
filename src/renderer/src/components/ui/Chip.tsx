import type { HTMLAttributes } from 'react';
import { cx } from './cx';

type ChipTone = 'neutral' | 'success' | 'warning' | 'danger' | 'mirror';

const TONE_CLASSES: Record<ChipTone, string> = {
  neutral: 'border-line-subtle bg-surface-2 text-ink-secondary',
  success: 'border-success-border bg-success-bg/70 text-success-text',
  warning: 'border-warning-border bg-warning-bg/70 text-warning-text',
  danger: 'border-danger-border bg-danger-bg/70 text-danger-text',
  mirror: 'border-mirror-border bg-mirror-2/60 text-mirror-muted',
};

type ChipProps = HTMLAttributes<HTMLSpanElement> & {
  readonly tone?: ChipTone;
};

export function Chip({ tone = 'neutral', className, ...props }: ChipProps): JSX.Element {
  return (
    <span
      className={cx(
        'inline-flex min-h-[22px] items-center justify-center whitespace-nowrap rounded-full border px-2 text-xs font-medium leading-none',
        TONE_CLASSES[tone],
        className,
      )}
      {...props}
    />
  );
}
