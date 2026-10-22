import type { ReactNode } from 'react';
import { cx } from './cx';

const TONE_CLASSES = {
  blue: 'bg-tone-blue',
  indigo: 'bg-tone-indigo',
  green: 'bg-tone-green',
  orange: 'bg-tone-orange',
  red: 'bg-tone-red',
  purple: 'bg-tone-purple',
  gray: 'bg-tone-gray',
  teal: 'bg-tone-teal',
} as const;

export type IconTileTone = keyof typeof TONE_CLASSES;

/** Each size also sets the glyph's size, so callers pass a plain icon. */
const SIZE_CLASSES = {
  /** Settings and device rows. */
  sm: 'size-7 rounded-[7px] [&>svg]:size-4',
  /** Empty and setup states. */
  lg: 'size-14 rounded-2xl [&>svg]:size-7',
} as const;

/** Colored square with a white stroked glyph, like the icons in the system settings. */
export function IconTile({
  tone,
  size = 'sm',
  className,
  children,
}: {
  readonly tone: IconTileTone;
  readonly size?: keyof typeof SIZE_CLASSES;
  readonly className?: string;
  /** The glyph: a stroked SVG that uses `currentColor`. */
  readonly children: ReactNode;
}): JSX.Element {
  return (
    <span
      aria-hidden
      className={cx(
        'flex shrink-0 items-center justify-center text-white',
        SIZE_CLASSES[size],
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
