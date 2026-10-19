import { cx } from './cx';

export type StatusTone = 'success' | 'warning' | 'idle';

const DOT_CLASSES: Record<StatusTone, string> = {
  success: 'bg-success',
  warning: 'bg-warning',
  idle: 'bg-ink-3',
};

type StatusDotProps = {
  readonly tone: StatusTone;
  readonly label: string;
};

/** Colored dot followed by a plain text label, as used in native list rows. */
export function StatusDot({ tone, label }: StatusDotProps): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-ink-2">
      <span className={cx('size-1.5 rounded-full', DOT_CLASSES[tone])} aria-hidden />
      {label}
    </span>
  );
}
