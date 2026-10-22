import { useEffect } from 'react';
import {
  CAPTURE_ACTIONS,
  DEFAULT_PREFERENCES,
  RECORDING_FORMATS,
  type CaptureAction,
  type RecordingFormat,
} from '../../../../../shared/preferences/types';
import {
  MIRROR_QUALITY_ORDER,
  MIRROR_QUALITY_PRESETS,
  qualityPresetOf,
  type MirrorQualityPreset,
} from '../../../../../shared/mirror/quality';
import type { MirrorOptions } from '../../../../../shared/mirror/types';
import { Button } from '../../../components/ui/Button';
import { Select, type SelectOption } from '../../../components/ui/Select';
import { cx } from '../../../components/ui/cx';
import logoUrl from '../../../assets/masaya-logo.svg';
import momotomboUrl from '../../../assets/momotombo-mark.svg';
import { useI18n } from '../../../shared/i18n';
import { usePreferences } from '../../../shared/preferences';
import { LANGUAGE_PREFERENCES, type LanguagePreference } from '../../../../../shared/i18n/locale';
import type { MessageKey } from '../../../../../shared/i18n/messages';
import { useDeviceSettings } from '../useDeviceSettings';
import { SettingRow, SettingsSection, ToggleRow } from './settings-layout';
import { ROW_ICONS } from './row-icons';

type SettingsPanelProps = {
  readonly deviceId: string;
  /** The video settings the mirror is running with right now. */
  readonly options: MirrorOptions;
  /** True while the stream restarts after a change of options. */
  readonly busy: boolean;
  /** Restarts the stream with the changed options and remembers them as preferences. */
  readonly onOptionsChange: (patch: Partial<MirrorOptions>) => void;
  readonly onClose: () => void;
};

const CAPTURE_ACTION_KEYS: Record<CaptureAction, MessageKey> = {
  preview: 'settings.captureAction.preview',
  copy: 'settings.captureAction.copy',
  save: 'settings.captureAction.save',
};

const RECORDING_FORMAT_KEYS: Record<RecordingFormat, MessageKey> = {
  video: 'settings.recordingFormat.video',
  gif: 'settings.recordingFormat.gif',
};

const LANGUAGE_KEYS: Record<LanguagePreference, MessageKey> = {
  system: 'settings.language.system',
  es: 'settings.language.es',
  en: 'settings.language.en',
};

const PRESET_KEYS: Record<MirrorQualityPreset, MessageKey> = {
  balanced: 'settings.preset.balanced',
  high: 'settings.preset.high',
  max: 'settings.preset.max',
};

const RESOLUTIONS = [720, 1024, 1280, 1920, 2560, 3840];
const BIT_RATES_MBPS = [2, 4, 8, 16, 32, 48];

/** The list always contains the current value, even one set by hand outside the usual steps. */
function withCurrent(values: readonly number[], current: number): readonly number[] {
  return values.includes(current) ? values : [...values, current].sort((a, b) => a - b);
}

/** Full-size settings screen over the mirror, grouped like the rest of the app: window, image, device. */
export function SettingsPanel({
  deviceId,
  options,
  busy,
  onOptionsChange,
  onClose,
}: SettingsPanelProps): JSX.Element {
  const { t } = useI18n();
  const { preferences, update: onPreferenceChange } = usePreferences();
  const device = useDeviceSettings(deviceId);
  const activePreset = qualityPresetOf(options);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const resolutionOptions: readonly SelectOption<number>[] = withCurrent(
    RESOLUTIONS,
    options.maxSize,
  ).map((value) => ({ value, label: `${value} px` }));
  const bitRateOptions: readonly SelectOption<number>[] = withCurrent(
    BIT_RATES_MBPS.map((mbps) => mbps * 1_000_000),
    options.videoBitRate,
  ).map((value) => ({ value, label: `${value / 1_000_000} Mbps` }));
  const captureOptions: readonly SelectOption<CaptureAction>[] = CAPTURE_ACTIONS.map((value) => ({
    value,
    label: t(CAPTURE_ACTION_KEYS[value]),
  }));
  const recordingOptions: readonly SelectOption<RecordingFormat>[] = RECORDING_FORMATS.map(
    (value) => ({ value, label: t(RECORDING_FORMAT_KEYS[value]) }),
  );
  const codecOptions: readonly SelectOption<MirrorOptions['videoCodec']>[] = [
    { value: 'h264', label: t('settings.codec.h264') },
    { value: 'h265', label: t('settings.codec.h265') },
  ];
  const languageOptions: readonly SelectOption<LanguagePreference>[] = LANGUAGE_PREFERENCES.map(
    (value) => ({ value, label: t(LANGUAGE_KEYS[value]) }),
  );

  const applyPreset = (preset: MirrorQualityPreset): void =>
    onOptionsChange(MIRROR_QUALITY_PRESETS[preset].values);

  const reset = (): void => {
    onPreferenceChange({
      navigationBar: DEFAULT_PREFERENCES.navigationBar,
      alwaysOnTop: DEFAULT_PREFERENCES.alwaysOnTop,
      showClicks: DEFAULT_PREFERENCES.showClicks,
      captureAction: DEFAULT_PREFERENCES.captureAction,
      recordingFormat: DEFAULT_PREFERENCES.recordingFormat,
    });
    onOptionsChange(DEFAULT_PREFERENCES.mirror);
  };

  return (
    <div
      role="dialog"
      aria-label={t('settings.title')}
      className="absolute inset-0 z-40 flex flex-col bg-window text-ink"
    >
      <header className="relative flex h-11 shrink-0 items-center justify-center border-b border-line bg-content/80 px-4 backdrop-blur-xl">
        <h2 className="text-base font-semibold">{t('settings.title')}</h2>
        <Button className="absolute right-2 font-semibold" variant="link" onClick={onClose}>
          {t('common.close')}
        </Button>
      </header>

      <div className="min-h-0 flex-1 select-none overflow-y-auto p-4">
        <div className="mx-auto flex max-w-xl flex-col gap-6">
          <div className="flex flex-col items-center gap-2 pb-1 pt-2">
            <img src={logoUrl} alt="Masaya" className="size-16 drop-shadow-sm" />
            <p className="text-lg font-semibold">Masaya</p>
          </div>

          <SettingsSection title={t('settings.section.window')}>
            <ToggleRow
              label={t('settings.navigationBar')}
              icon={ROW_ICONS.navigation}
              tone="blue"
              checked={preferences.navigationBar}
              onChange={(navigationBar) => onPreferenceChange({ navigationBar })}
            />
            <ToggleRow
              label={t('settings.alwaysOnTop')}
              icon={ROW_ICONS.pin}
              tone="orange"
              checked={preferences.alwaysOnTop}
              onChange={(alwaysOnTop) => onPreferenceChange({ alwaysOnTop })}
            />
            <ToggleRow
              label={t('settings.showClicks')}
              hint={t('settings.showClicks.hint')}
              icon={ROW_ICONS.pointer}
              tone="purple"
              checked={preferences.showClicks}
              onChange={(showClicks) => onPreferenceChange({ showClicks })}
            />
            <SettingRow label={t('settings.captureAction')} icon={ROW_ICONS.camera} tone="red">
              <Select
                label={t('settings.captureAction')}
                value={preferences.captureAction}
                options={captureOptions}
                onChange={(captureAction) => onPreferenceChange({ captureAction })}
              />
            </SettingRow>
            <SettingRow label={t('settings.recordingFormat')} icon={ROW_ICONS.camera} tone="red">
              <Select
                label={t('settings.recordingFormat')}
                value={preferences.recordingFormat}
                options={recordingOptions}
                onChange={(recordingFormat) => onPreferenceChange({ recordingFormat })}
              />
            </SettingRow>
            <SettingRow label={t('settings.language')} icon={ROW_ICONS.globe} tone="teal">
              <Select
                label={t('settings.language')}
                value={preferences.language}
                options={languageOptions}
                onChange={(language) => onPreferenceChange({ language })}
              />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title={t('settings.section.quality')}>
            <SettingRow label={t('settings.presets')}>
              <div
                role="group"
                aria-label={t('settings.presets')}
                className="flex rounded-[9px] bg-ink-3/20 p-0.5"
              >
                {MIRROR_QUALITY_ORDER.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    aria-pressed={activePreset === preset}
                    disabled={busy}
                    onClick={() => applyPreset(preset)}
                    className={cx(
                      'h-6 rounded-[7px] px-3 text-base transition-colors duration-100 disabled:opacity-40',
                      activePreset === preset
                        ? 'bg-fill font-medium text-ink shadow-control'
                        : 'text-ink-2 enabled:hover:text-ink',
                    )}
                  >
                    {t(PRESET_KEYS[preset])}
                  </button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label={t('settings.maxSize')}>
              <Select
                label={t('settings.maxSize')}
                value={options.maxSize}
                options={resolutionOptions}
                disabled={busy}
                onChange={(maxSize) => onOptionsChange({ maxSize })}
              />
            </SettingRow>
            <SettingRow label={t('settings.bitRate')}>
              <Select
                label={t('settings.bitRate')}
                value={options.videoBitRate}
                options={bitRateOptions}
                disabled={busy}
                onChange={(videoBitRate) => onOptionsChange({ videoBitRate })}
              />
            </SettingRow>
            <SettingRow label={t('settings.codec')}>
              <Select
                label={t('settings.codec')}
                value={options.videoCodec}
                options={codecOptions}
                disabled={busy}
                onChange={(videoCodec) => onOptionsChange({ videoCodec })}
              />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title={t('settings.section.device')}>
            <ToggleRow
              label={t('settings.audio')}
              hint={t('settings.audio.hint')}
              icon={ROW_ICONS.speaker}
              tone="blue"
              checked={options.audioEnabled}
              disabled={busy}
              onChange={(audioEnabled) => onOptionsChange({ audioEnabled })}
            />
            <ToggleRow
              label={t('settings.clipboard')}
              icon={ROW_ICONS.clipboard}
              tone="teal"
              checked={options.clipboardSync}
              disabled={busy}
              onChange={(clipboardSync) => onOptionsChange({ clipboardSync })}
            />
            <ToggleRow
              label={t('settings.showTouches')}
              hint={t('settings.showTouches.hint')}
              icon={ROW_ICONS.touch}
              tone="green"
              checked={device.settings?.showTouches ?? false}
              disabled={device.settings === null}
              onChange={(enabled) => void device.set('showTouches', enabled)}
            />
            <ToggleRow
              label={t('settings.stayAwake')}
              icon={ROW_ICONS.sun}
              tone="orange"
              checked={device.settings?.stayAwake ?? false}
              disabled={device.settings === null}
              onChange={(enabled) => void device.set('stayAwake', enabled)}
            />
            {device.error && (
              <p role="alert" className="px-4 py-2.5 text-sm text-danger">
                {device.error}
              </p>
            )}
          </SettingsSection>

          <div className="flex justify-center">
            <Button variant="danger" onClick={reset} disabled={busy}>
              {t('settings.reset')}
            </Button>
          </div>

          <footer className="flex items-center justify-center gap-1.5 pb-2 pt-2 text-sm text-ink-3">
            {t('settings.credits')}
            <img src={momotomboUrl} alt="" className="size-[18px]" />
          </footer>
        </div>
      </div>
    </div>
  );
}
