// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ANDROID_KEYCODE } from '../android-keycodes';
import { useDeviceKeys } from '../useDeviceKeys';

const sendControl = vi.fn();

describe('useDeviceKeys', () => {
  beforeEach(() => {
    sendControl.mockReset().mockResolvedValue({ ok: true, value: undefined });
    vi.stubGlobal('masaya', { sendControl });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('presses and releases the key on the given device, in that order', () => {
    const { result } = renderHook(() => useDeviceKeys('device-1'));

    result.current(ANDROID_KEYCODE.home);

    expect(sendControl.mock.calls).toEqual([
      ['device-1', { type: 'key', action: 0, keyCode: 3, repeat: 0, metaState: 0 }],
      ['device-1', { type: 'key', action: 1, keyCode: 3, repeat: 0, metaState: 0 }],
    ]);
  });

  it('reports why a press did not reach the device', async () => {
    sendControl.mockResolvedValueOnce({ ok: false, error: 'device offline' });
    const onError = vi.fn();
    const { result } = renderHook(() => useDeviceKeys('device-1', onError));

    result.current(ANDROID_KEYCODE.home);

    await waitFor(() => expect(onError).toHaveBeenCalledExactlyOnceWith('device offline'));
  });

  it('reports a rejected bridge call instead of leaving it unhandled', async () => {
    sendControl.mockRejectedValue(new Error('ipc closed'));
    const onError = vi.fn();
    const { result } = renderHook(() => useDeviceKeys('device-1', onError));

    result.current(ANDROID_KEYCODE.home);

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith('Sin conexión con la app. Reiníciala.'),
    );
  });

  it('uses the Android codes for navigation, volume and power', () => {
    expect(ANDROID_KEYCODE).toEqual({
      home: 3,
      back: 4,
      volumeUp: 24,
      volumeDown: 25,
      power: 26,
      appSwitch: 187,
    });
  });

  it('is a no-op without the preload bridge', () => {
    vi.stubGlobal('masaya', undefined);
    const { result } = renderHook(() => useDeviceKeys('device-1'));

    expect(() => result.current(ANDROID_KEYCODE.back)).not.toThrow();
    expect(sendControl).not.toHaveBeenCalled();
  });
});
