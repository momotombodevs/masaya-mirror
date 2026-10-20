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

export function PhoneIcon({ className }: { readonly className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </svg>
  );
}
