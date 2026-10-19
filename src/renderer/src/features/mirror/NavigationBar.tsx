import { Button } from '../../components/ui/Button';
import { ANDROID_KEYCODE } from './android-keycodes';
import { useDeviceKeys } from './useDeviceKeys';

type NavigationBarProps = {
  readonly deviceId: string;
  readonly disabled?: boolean;
};

const ICON = {
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

/** Back, Home and Recents under the screen, like the buttons of the phone itself. */
export function NavigationBar({ deviceId, disabled = false }: NavigationBarProps): JSX.Element {
  const pressKey = useDeviceKeys(deviceId);

  return (
    <nav
      aria-label="Navegación del dispositivo"
      className="flex h-10 shrink-0 items-center justify-center gap-10 border-t border-mirror-line bg-mirror-bar"
    >
      <Button
        icon
        variant="toolbar"
        title="Atrás"
        aria-label="Atrás"
        disabled={disabled}
        onClick={() => pressKey(ANDROID_KEYCODE.back)}
      >
        <svg {...ICON}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      </Button>
      <Button
        icon
        variant="toolbar"
        title="Inicio"
        aria-label="Inicio"
        disabled={disabled}
        onClick={() => pressKey(ANDROID_KEYCODE.home)}
      >
        <svg {...ICON}>
          <circle cx="12" cy="12" r="7" />
        </svg>
      </Button>
      <Button
        icon
        variant="toolbar"
        title="Apps recientes"
        aria-label="Apps recientes"
        disabled={disabled}
        onClick={() => pressKey(ANDROID_KEYCODE.appSwitch)}
      >
        <svg {...ICON}>
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      </Button>
    </nav>
  );
}
