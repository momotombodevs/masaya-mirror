import type { ReactNode } from 'react';

/** A titled card that groups related settings. */
export function SettingsSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <section className="rounded-panel border border-line bg-content">
      <h3 className="px-4 pb-1 pt-3 text-lg font-semibold">{title}</h3>
      <div className="divide-y divide-line px-4">{children}</div>
    </section>
  );
}

/** One setting: a label with an optional hint on the left, its control on the right. */
export function SettingRow({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string | undefined;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p>{label}</p>
        {hint && <p className="text-sm text-ink-3">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
