import type { ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { BackIcon, HomeIcon, RecentsIcon } from '../../components/ui/icons';
import { useI18n } from '../../shared/i18n';
import { ANDROID_KEYCODE } from './android-keycodes';
import { useDeviceKeys } from './useDeviceKeys';

type NavigationBarProps = {
  readonly deviceId: string;
  readonly disabled?: boolean;
};

/** Back, Home and Recents under the screen, like the buttons of the phone itself. */
export function NavigationBar({ deviceId, disabled = false }: NavigationBarProps): JSX.Element {
  const { t } = useI18n();
  const pressKey = useDeviceKeys(deviceId);

  const keyButton = (label: string, keyCode: number, icon: ReactNode): JSX.Element => (
    <DeviceKeyButton label={label} disabled={disabled} onPress={() => pressKey(keyCode)}>
      {icon}
    </DeviceKeyButton>
  );

  return (
    <nav
      aria-label={t('nav.label')}
      className="flex h-10 shrink-0 items-center justify-center gap-10 border-t border-mirror-line bg-mirror-bar"
    >
      {keyButton(t('nav.back'), ANDROID_KEYCODE.back, <BackIcon />)}
      {keyButton(t('nav.home'), ANDROID_KEYCODE.home, <HomeIcon />)}
      {keyButton(t('nav.recents'), ANDROID_KEYCODE.appSwitch, <RecentsIcon />)}
    </nav>
  );
}

type DeviceKeyButtonProps = {
  readonly label: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
  readonly children: ReactNode;
};

function DeviceKeyButton({
  label,
  disabled,
  onPress,
  children,
}: DeviceKeyButtonProps): JSX.Element {
  return (
    <Button
      icon
      variant="toolbar"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </Button>
  );
}
