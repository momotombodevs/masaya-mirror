// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AndroidDevice } from '../../../../../shared/device/types';
import { useDevices } from '../useDevices';

const listDevices = vi.fn();

const phone = (id: string): AndroidDevice => ({ id, status: 'device', model: id });

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

describe('useDevices', () => {
  beforeEach(() => {
    listDevices.mockReset().mockResolvedValue({ ok: true, value: [phone('a')] });
    vi.stubGlobal('manolo', { listDevices });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('loads the devices on mount', async () => {
    const { result } = renderHook(() => useDevices());

    await waitFor(() => expect(result.current.devices).toEqual([phone('a')]));
    expect(result.current.error).toBeNull();
  });

  it('keeps the previous list when a background refresh fails', async () => {
    const { result } = renderHook(() => useDevices());
    await waitFor(() => expect(result.current.devices).toHaveLength(1));

    listDevices.mockResolvedValue({ ok: false, error: 'adb hiccup' });
    await act(async () => result.current.refresh({ silent: true }));

    expect(result.current.devices).toEqual([phone('a')]);
    expect(result.current.error).toBe('adb hiccup');
  });

  it('clears the list when a refresh the user asked for fails', async () => {
    const { result } = renderHook(() => useDevices());
    await waitFor(() => expect(result.current.devices).toHaveLength(1));

    listDevices.mockRejectedValue(new Error('ipc closed'));
    await act(async () => result.current.refresh());

    expect(result.current.devices).toEqual([]);
    expect(result.current.error).toBe('No se pudo cargar la lista.');
  });

  it('skips a background refresh while another request is running', async () => {
    const { result } = renderHook(() => useDevices());
    await waitFor(() => expect(result.current.devices).toHaveLength(1));
    const slow = deferred<unknown>();
    listDevices.mockClear().mockReturnValue(slow.promise);

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.refresh({ silent: true });
    });
    await act(async () => result.current.refresh({ silent: true }));
    expect(listDevices).toHaveBeenCalledTimes(1);

    await act(async () => {
      slow.resolve({ ok: true, value: [] });
      await pending;
    });
  });

  it('ignores a response that was overtaken by a newer request', async () => {
    const { result } = renderHook(() => useDevices());
    await waitFor(() => expect(result.current.devices).toHaveLength(1));
    const old = deferred<unknown>();
    listDevices.mockClear().mockReturnValueOnce(old.promise);

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.refresh();
    });
    listDevices.mockResolvedValueOnce({ ok: true, value: [phone('b')] });
    await act(async () => result.current.refresh());
    expect(result.current.devices).toEqual([phone('b')]);

    await act(async () => {
      old.resolve({ ok: true, value: [phone('stale')] });
      await first;
    });

    expect(result.current.devices).toEqual([phone('b')]);
  });
});
