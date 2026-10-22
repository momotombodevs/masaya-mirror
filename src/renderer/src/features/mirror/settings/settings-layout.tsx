import type { ReactNode } from 'react';
import { GROUPED_CARD_CLASSES } from '../../../components/ui/card';
import { Toggle } from '../../../components/ui/Toggle';
import { IconTile, type IconTileTone } from '../../../components/ui/IconTile';
import { PathGlyph } from '../../../components/ui/icons';

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
      <div className={GROUPED_CARD_CLASSES}>{children}</div>
    </section>
  );
}

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
  readonly tone?: IconTileTone;
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <div className="flex min-h-[44px] items-center justify-between gap-3 px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        {icon && (
          <IconTile tone={tone}>
            <PathGlyph d={icon} />
          </IconTile>
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

/** A setting that is a plain on/off switch. */
export function ToggleRow({
  label,
  hint,
  icon,
  tone,
  checked,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly icon?: string;
  readonly tone?: IconTileTone;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onChange: (checked: boolean) => void;
}): JSX.Element {
  return (
    <SettingRow label={label} hint={hint} {...(icon ? { icon } : {})} {...(tone ? { tone } : {})}>
      <Toggle label={label} checked={checked} disabled={disabled ?? false} onChange={onChange} />
    </SettingRow>
  );
}
