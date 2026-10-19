import type { ReactNode } from 'react';
import { cx } from '../../../components/ui/cx';

/** A titled, inset group of rows, like a grouped list in the system settings. */
export function SettingsSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <section>
      <h3 className="px-4 pb-1.5 text-sm uppercase tracking-wide text-ink-3">{title}</h3>
      <div className="divide-y divide-line overflow-hidden rounded-panel bg-content shadow-control ring-1 ring-line">
        {children}
      </div>
    </section>
  );
}

export type RowIconTone = 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'gray' | 'teal';

const TONE_CLASSES: Record<RowIconTone, string> = {
  blue: 'bg-[#0a84ff]',
  green: 'bg-[#30b050]',
  orange: 'bg-[#ff9f0a]',
  red: 'bg-[#ff453a]',
  purple: 'bg-[#8e5cf7]',
  gray: 'bg-[#8e8e93]',
  teal: 'bg-[#30b0c7]',
};

/** One setting: a label with an optional hint on the left, its control on the right. */
export function SettingRow({
  label,
  hint,
  icon,
  tone = 'gray',
  children,
}: {
  readonly label: string;
  readonly hint?: string | undefined;
  /** SVG path data (24×24, stroked) for the colored tile before the label. */
  readonly icon?: string;
  readonly tone?: RowIconTone;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <span
            aria-hidden
            className={cx(
              'flex size-7 shrink-0 items-center justify-center rounded-[7px] text-white',
              TONE_CLASSES[tone],
            )}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={icon} />
            </svg>
          </span>
        )}
        <div className="min-w-0">
          <p>{label}</p>
          {hint && <p className="text-sm text-ink-3">{hint}</p>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
