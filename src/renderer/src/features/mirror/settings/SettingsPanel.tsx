import { useEffect } from 'react';
import {
  CAPTURE_ACTIONS,
  DEFAULT_PREFERENCES,
  type CaptureAction,
  type MirrorVideoPreferences,
  type Preferences,
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
import { Toggle } from '../../../components/ui/Toggle';
import { useDeviceSettings } from '../useDeviceSettings';
import { SettingRow, SettingsSection } from './settings-layout';

type SettingsPanelProps = {
  readonly deviceId: string;
  readonly preferences: Preferences;
  /** The video settings the mirror is running with right now. */
  readonly options: MirrorOptions;
  /** True while the stream restarts after a video change. */
  readonly busy: boolean;
  readonly onPreferenceChange: (patch: Partial<Preferences>) => void;
  readonly onVideoChange: (patch: Partial<MirrorVideoPreferences>) => void;
  readonly onClose: () => void;
};

const CAPTURE_ACTION_LABELS: Record<CaptureAction, string> = {
  preview: 'Mostrar vista previa',
  copy: 'Copiar al portapapeles',
  save: 'Guardar en un archivo',
};

const RESOLUTIONS = [720, 1024, 1280, 1920, 2560, 3840];
const BIT_RATES_MBPS = [2, 4, 8, 16, 32, 48];

const CODEC_OPTIONS: readonly SelectOption<MirrorOptions['videoCodec']>[] = [
  { value: 'h264', label: 'H.264 (compatible)' },
  { value: 'h265', label: 'H.265 (menos datos)' },
];

/** The list always contains the current value, even one set by hand outside the usual steps. */
function withCurrent(values: readonly number[], current: number): readonly number[] {
  return values.includes(current) ? values : [...values, current].sort((a, b) => a - b);
}

/** Full-size settings screen over the mirror, grouped like the rest of the app: window, image, device. */
export function SettingsPanel({
  deviceId,
  preferences,
  options,
  busy,
  onPreferenceChange,
  onVideoChange,
  onClose,
}: SettingsPanelProps): JSX.Element {
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
    label: CAPTURE_ACTION_LABELS[value],
  }));

  const applyPreset = (preset: MirrorQualityPreset): void =>
    onVideoChange(MIRROR_QUALITY_PRESETS[preset].values);

  const reset = (): void => {
    onPreferenceChange({
      navigationBar: DEFAULT_PREFERENCES.navigationBar,
      alwaysOnTop: DEFAULT_PREFERENCES.alwaysOnTop,
      showClicks: DEFAULT_PREFERENCES.showClicks,
      captureAction: DEFAULT_PREFERENCES.captureAction,
    });
    onVideoChange(DEFAULT_PREFERENCES.mirror);
  };

  return (
    <div
      role="dialog"
      aria-label="Ajustes"
      className="absolute inset-0 z-40 flex flex-col bg-window text-ink"
    >
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-content px-4">
        <h2 className="text-lg font-semibold">Ajustes</h2>
        <Button onClick={onClose}>Cerrar</Button>
      </header>

      <div className="min-h-0 flex-1 select-none overflow-y-auto p-4">
        <div className="mx-auto flex max-w-xl flex-col gap-4">
          <SettingsSection title="Ventana">
            <SettingRow
              label="Barra de navegación"
              hint="Atrás, Inicio y Recientes bajo la pantalla."
            >
              <Toggle
                label="Barra de navegación"
                checked={preferences.navigationBar}
                onChange={(navigationBar) => onPreferenceChange({ navigationBar })}
              />
            </SettingRow>
            <SettingRow label="Siempre visible" hint="Mantiene la ventana por encima de las demás.">
              <Toggle
                label="Siempre visible"
                checked={preferences.alwaysOnTop}
                onChange={(alwaysOnTop) => onPreferenceChange({ alwaysOnTop })}
              />
            </SettingRow>
            <SettingRow
              label="Mostrar clics en el espejo"
              hint="Dibuja un círculo donde tocas, para que quien mira la ventana lo vea."
            >
              <Toggle
                label="Mostrar clics en el espejo"
                checked={preferences.showClicks}
                onChange={(showClicks) => onPreferenceChange({ showClicks })}
              />
            </SettingRow>
            <SettingRow label="Al tomar una captura">
              <Select
                label="Al tomar una captura"
                value={preferences.captureAction}
                options={captureOptions}
                onChange={(captureAction) => onPreferenceChange({ captureAction })}
              />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title="Calidad de imagen">
            <SettingRow
              label="Preajustes"
              hint={
                activePreset
                  ? MIRROR_QUALITY_PRESETS[activePreset].detail
                  : 'Valores personalizados'
              }
            >
              <div role="group" aria-label="Preajustes" className="flex gap-1">
                {MIRROR_QUALITY_ORDER.map((preset) => (
                  <Button
                    key={preset}
                    variant={activePreset === preset ? 'primary' : 'default'}
                    aria-pressed={activePreset === preset}
                    disabled={busy}
                    onClick={() => applyPreset(preset)}
                  >
                    {MIRROR_QUALITY_PRESETS[preset].label}
                  </Button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="Resolución máxima" hint="Lado más largo de la imagen.">
              <Select
                label="Resolución máxima"
                value={options.maxSize}
                options={resolutionOptions}
                disabled={busy}
                onChange={(maxSize) => onVideoChange({ maxSize })}
              />
            </SettingRow>
            <SettingRow label="Velocidad de datos" hint="Más datos, más nitidez y más consumo.">
              <Select
                label="Velocidad de datos"
                value={options.videoBitRate}
                options={bitRateOptions}
                disabled={busy}
                onChange={(videoBitRate) => onVideoChange({ videoBitRate })}
              />
            </SettingRow>
            <SettingRow label="Códec de video">
              <Select
                label="Códec de video"
                value={options.videoCodec}
                options={CODEC_OPTIONS}
                disabled={busy}
                onChange={(videoCodec) => onVideoChange({ videoCodec })}
              />
            </SettingRow>
          </SettingsSection>

          <SettingsSection title="Dispositivo">
            <SettingRow label="Mostrar toques" hint="Dibuja un punto donde se toca la pantalla.">
              <Toggle
                label="Mostrar toques"
                checked={device.settings?.showTouches ?? false}
                disabled={device.settings === null}
                onChange={(enabled) => void device.set('showTouches', enabled)}
              />
            </SettingRow>
            <SettingRow
              label="Mantener pantalla encendida"
              hint="Mientras el teléfono esté cargando o conectado."
            >
              <Toggle
                label="Mantener pantalla encendida"
                checked={device.settings?.stayAwake ?? false}
                disabled={device.settings === null}
                onChange={(enabled) => void device.set('stayAwake', enabled)}
              />
            </SettingRow>
            {device.error && (
              <p role="alert" className="py-2.5 text-sm text-danger">
                {device.error}
              </p>
            )}
          </SettingsSection>

          <div className="flex justify-end pb-2">
            <Button variant="plain" onClick={reset} disabled={busy}>
              Restablecer valores
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
