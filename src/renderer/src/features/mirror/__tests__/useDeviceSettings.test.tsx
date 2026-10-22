// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeviceSettings } from '../useDeviceSettings';

const getDeviceSettings = vi.fn();
const setDeviceSetting = vi.fn();

describe('useDeviceSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('masaya', { getDeviceSettings, setDeviceSetting });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('reads the phone settings for its own device', async () => {
    getDeviceSettings.mockResolvedValue({
      ok: true,
      value: { showTouches: true, stayAwake: false },
    });

    const { result } = renderHook(() => useDeviceSettings('device-1'));

    expect(result.current.settings).toBeNull();
    await waitFor(() =>
      expect(result.current.settings).toEqual({ showTouches: true, stayAwake: false }),
    );
    expect(getDeviceSettings).toHaveBeenCalledWith('device-1');
  });

  it('shows why the phone could not be read', async () => {
    getDeviceSettings.mockResolvedValue({ ok: false, error: 'error: device offline' });

    const { result } = renderHook(() => useDeviceSettings('device-1'));

    await waitFor(() => expect(result.current.error).toBe('error: device offline'));
    expect(result.current.settings).toBeNull();
  });

  it('writes a setting and updates it locally only after the phone accepted it', async () => {
    getDeviceSettings.mockResolvedValue({
      ok: true,
      value: { showTouches: false, stayAwake: false },
    });
    setDeviceSetting.mockResolvedValue({ ok: true, value: undefined });
    const { result } = renderHook(() => useDeviceSettings('device-1'));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => result.current.set('showTouches', true));

    expect(setDeviceSetting).toHaveBeenCalledWith('device-1', 'showTouches', true);
    expect(result.current.settings).toEqual({ showTouches: true, stayAwake: false });
  });

  it('keeps the old value and shows the error when the phone refuses', async () => {
    getDeviceSettings.mockResolvedValue({
      ok: true,
      value: { showTouches: false, stayAwake: false },
    });
    setDeviceSetting.mockResolvedValue({ ok: false, error: 'Permission denied' });
    const { result } = renderHook(() => useDeviceSettings('device-1'));
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => result.current.set('stayAwake', true));

    expect(result.current.settings?.stayAwake).toBe(false);
    expect(result.current.error).toBe('Permission denied');
  });
});
