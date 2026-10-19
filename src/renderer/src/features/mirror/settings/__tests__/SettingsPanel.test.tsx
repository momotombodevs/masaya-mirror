// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_MIRROR_OPTIONS } from '../../../../../../shared/mirror/types';
import { DEFAULT_PREFERENCES } from '../../../../../../shared/preferences/types';
import { SettingsPanel } from '../SettingsPanel';

const getDeviceSettings = vi.fn();
const setDeviceSetting = vi.fn();
const onPreferenceChange = vi.fn();
const onVideoChange = vi.fn();
const onClose = vi.fn();

type Props = Partial<Parameters<typeof SettingsPanel>[0]>;

const renderPanel = (props: Props = {}): void => {
  render(
    <SettingsPanel
      deviceId="device-1"
      preferences={DEFAULT_PREFERENCES}
      options={DEFAULT_MIRROR_OPTIONS}
      busy={false}
      onPreferenceChange={onPreferenceChange}
      onVideoChange={onVideoChange}
      onClose={onClose}
      {...props}
    />,
  );
};

const toggle = (name: string): HTMLButtonElement =>
  screen.getByRole('switch', { name }) as HTMLButtonElement;

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDeviceSettings.mockResolvedValue({
      ok: true,
      value: { showTouches: false, stayAwake: true },
    });
    setDeviceSetting.mockResolvedValue({ ok: true, value: undefined });
    vi.stubGlobal('manolo', { getDeviceSettings, setDeviceSetting });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('groups settings into window, image and device sections', () => {
    renderPanel();

    for (const title of ['Ventana', 'Calidad de imagen', 'Dispositivo']) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }
  });

  it('shows the logo and the credits footer', () => {
    renderPanel();

    expect(screen.getByRole('img', { name: 'Manolo Mirror' })).toBeTruthy();
    expect(screen.getByText('Crafted with passion by Momotombo Devs')).toBeTruthy();
  });

  it('reflects the current window preferences', () => {
    renderPanel({
      preferences: { ...DEFAULT_PREFERENCES, navigationBar: false, alwaysOnTop: true },
    });

    expect(toggle('Barra de navegación').getAttribute('aria-checked')).toBe('false');
    expect(toggle('Siempre visible').getAttribute('aria-checked')).toBe('true');
  });

  it('saves a window toggle as a one-field patch', () => {
    renderPanel();

    fireEvent.click(toggle('Barra de navegación'));

    expect(onPreferenceChange).toHaveBeenCalledWith({ navigationBar: false });
  });

  it('changes what a capture does', () => {
    renderPanel();

    fireEvent.change(screen.getByRole('combobox', { name: 'Al tomar una captura' }), {
      target: { value: 'copy' },
    });

    expect(onPreferenceChange).toHaveBeenCalledWith({ captureAction: 'copy' });
  });

  it('marks the active preset and applies another one', () => {
    renderPanel();
    const presets = screen.getByRole('group', { name: 'Preajustes' });

    expect(within(presets).getByRole('button', { name: 'Alta' }).getAttribute('aria-pressed')).toBe(
      'true',
    );

    fireEvent.click(within(presets).getByRole('button', { name: 'Máxima' }));

    expect(onVideoChange).toHaveBeenCalledWith({ maxSize: 2560, videoBitRate: 32_000_000 });
  });

  it('shows custom values with no active preset and keeps them selectable', () => {
    renderPanel({ options: { ...DEFAULT_MIRROR_OPTIONS, maxSize: 1500 } });
    const presets = screen.getByRole('group', { name: 'Preajustes' });

    for (const button of within(presets).getAllByRole('button')) {
      expect(button.getAttribute('aria-pressed')).toBe('false');
    }
    expect(
      (screen.getByRole('combobox', { name: 'Resolución máxima' }) as HTMLSelectElement).value,
    ).toBe('1500');
  });

  it('sends numbers, not strings, for resolution, data rate and codec', () => {
    renderPanel();

    fireEvent.change(screen.getByRole('combobox', { name: 'Resolución máxima' }), {
      target: { value: '1280' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Velocidad de datos' }), {
      target: { value: '8000000' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Códec de video' }), {
      target: { value: 'h265' },
    });

    expect(onVideoChange.mock.calls).toEqual([
      [{ maxSize: 1280 }],
      [{ videoBitRate: 8_000_000 }],
      [{ videoCodec: 'h265' }],
    ]);
  });

  it('locks the video controls while the stream restarts', () => {
    renderPanel({ busy: true });

    expect(
      (screen.getByRole('combobox', { name: 'Resolución máxima' }) as HTMLSelectElement).disabled,
    ).toBe(true);
    expect(
      (
        within(screen.getByRole('group', { name: 'Preajustes' })).getByRole('button', {
          name: 'Máxima',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('loads the phone settings, then writes a change to the phone', async () => {
    renderPanel();
    expect(toggle('Mostrar toques').disabled).toBe(true);

    await waitFor(() =>
      expect(toggle('Mantener pantalla encendida').getAttribute('aria-checked')).toBe('true'),
    );
    fireEvent.click(toggle('Mostrar toques'));

    await waitFor(() =>
      expect(setDeviceSetting).toHaveBeenCalledWith('device-1', 'showTouches', true),
    );
    await waitFor(() => expect(toggle('Mostrar toques').getAttribute('aria-checked')).toBe('true'));
  });

  it('shows an error and keeps the device toggles locked when the phone cannot be read', async () => {
    getDeviceSettings.mockResolvedValue({ ok: false, error: 'error: device offline' });
    renderPanel();

    expect((await screen.findByRole('alert')).textContent).toContain('device offline');
    expect(toggle('Mostrar toques').disabled).toBe(true);
  });

  it('restores the defaults', () => {
    renderPanel({
      preferences: {
        ...DEFAULT_PREFERENCES,
        navigationBar: false,
        alwaysOnTop: true,
        captureAction: 'save',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer valores' }));

    expect(onPreferenceChange).toHaveBeenCalledWith({
      navigationBar: true,
      alwaysOnTop: false,
      captureAction: 'preview',
    });
    expect(onVideoChange).toHaveBeenCalledWith(DEFAULT_PREFERENCES.mirror);
  });

  it('closes with Cerrar and with Escape', () => {
    renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
