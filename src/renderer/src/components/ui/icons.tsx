import { cx } from './cx';

/** Shared look of the 24×24 stroked toolbar and navigation icons. */
const ICON_PROPS = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function CameraIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

export function RecordIcon({ recording }: { readonly recording: boolean }): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="8" />
      <circle
        cx="12"
        cy="12"
        r="4"
        className={cx(recording ? 'fill-red-500 stroke-red-500' : 'fill-current stroke-none')}
      />
    </svg>
  );
}

export function FullscreenIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

export function RotateIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <rect x="7" y="3" width="10" height="14" rx="2" />
      <path d="M5 21h8m0 0-2-2m2 2-2 2" />
    </svg>
  );
}

export function VolumeUpIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </svg>
  );
}

export function VolumeDownIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
    </svg>
  );
}

export function PowerIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 2v10" />
      <path d="M18.4 6.6a9 9 0 1 1-12.8 0" />
    </svg>
  );
}

export function ApkIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M12 3v12m0 0-4-4m4 4 4-4" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function SettingsIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </svg>
  );
}

export function BackIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function HomeIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="7" />
    </svg>
  );
}

export function RecentsIcon(): JSX.Element {
  return (
    <svg {...ICON_PROPS}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/** Stroked 24×24 glyph whose size is set by its container (an icon tile or a chip). */
const GLYPH_PROPS = { ...ICON_PROPS, width: 16, height: 16 } as const;

/** A glyph from SVG path data, as the settings rows store their icons. */
export function PathGlyph({ d }: { readonly d: string }): JSX.Element {
  return (
    <svg {...GLYPH_PROPS} strokeWidth={2}>
      <path d={d} />
    </svg>
  );
}

export function PhoneIcon(): JSX.Element {
  return (
    <svg {...GLYPH_PROPS}>
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}

export function QrIcon(): JSX.Element {
  return (
    <svg {...GLYPH_PROPS}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3" />
    </svg>
  );
}

export function WarningIcon(): JSX.Element {
  return (
    <svg {...GLYPH_PROPS}>
      <path d="M12 8v5M12 16.5v.01" />
      <path d="M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  );
}

export function UsbIcon(): JSX.Element {
  return (
    <svg {...GLYPH_PROPS} width={12} height={12} strokeWidth={2}>
      <path d="M12 3v14M12 3l-2.5 3h5zM7 10v2.5a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9" />
      <circle cx="12" cy="19" r="2" />
      <rect x="5.5" y="8" width="3" height="2" />
      <circle cx="17" cy="8" r="1.3" />
    </svg>
  );
}

export function WifiIcon(): JSX.Element {
  return (
    <svg {...GLYPH_PROPS} width={12} height={12} strokeWidth={2}>
      <path d="M2 8.8a15 15 0 0 1 20 0M5.5 12.3a10 10 0 0 1 13 0M9 15.8a5 5 0 0 1 6 0" />
      <circle cx="12" cy="19" r="1" />
    </svg>
  );
}
