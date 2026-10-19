// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PREFERENCES } from '../../../../../shared/preferences/types';
import { usePreferences } from '../usePreferences';

const getPreferences = vi.fn();
const setPreferences = vi.fn();

describe('usePreferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPreferences.mockResolvedValue({ ok: true, value: DEFAULT_PREFERENCES });
    vi.stubGlobal('manolo', { getPreferences, setPreferences });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('starts with defaults, then loads the saved preferences', async () => {
    const saved = { ...DEFAULT_PREFERENCES, navigationBar: false, captureAction: 'copy' as const };
    getPreferences.mockResolvedValue({ ok: true, value: saved });

    const { result } = renderHook(() => usePreferences());
    expect(result.current.loaded).toBe(false);
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.preferences).toEqual(saved);
  });

  it('is loaded with defaults when the saved preferences cannot be read', async () => {
    getPreferences.mockResolvedValue({ ok: false, error: 'boom' });

    const { result } = renderHook(() => usePreferences());

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('is loaded with defaults when the bridge call throws', async () => {
    getPreferences.mockRejectedValue(new Error('ipc closed'));

    const { result } = renderHook(() => usePreferences());

    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it('applies a change at once and saves only that patch', async () => {
    getPreferences.mockResolvedValue({ ok: true, value: DEFAULT_PREFERENCES });
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.update({ alwaysOnTop: true }));

    expect(result.current.preferences.alwaysOnTop).toBe(true);
    expect(result.current.preferences.navigationBar).toBe(true);
    expect(setPreferences).toHaveBeenCalledWith({ alwaysOnTop: true });
  });

  it('keeps the change on screen when saving fails', async () => {
    getPreferences.mockResolvedValue({ ok: true, value: DEFAULT_PREFERENCES });
    setPreferences.mockRejectedValue(new Error('ipc closed'));
    const { result } = renderHook(() => usePreferences());
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.update({ navigationBar: false }));

    expect(result.current.preferences.navigationBar).toBe(false);
  });
});
