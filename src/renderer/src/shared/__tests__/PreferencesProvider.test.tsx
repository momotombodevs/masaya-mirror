// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LanguagePreference } from '../../../../shared/i18n/locale';
import { DEFAULT_PREFERENCES } from '../../../../shared/preferences/types';
import { PreferencesProvider } from '../PreferencesProvider';
import { usePreferences } from '../preferences';

const getPreferences = vi.fn();
const setPreferences = vi.fn();
let emitLanguage: (language: LanguagePreference) => void = () => undefined;

const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
  <PreferencesProvider>{children}</PreferencesProvider>
);

describe('PreferencesProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPreferences.mockResolvedValue({ ok: true, value: DEFAULT_PREFERENCES });
    vi.stubGlobal('masaya', {
      getPreferences,
      setPreferences,
      onLanguageChange: (listener: (language: LanguagePreference) => void) => {
        emitLanguage = listener;
        return () => undefined;
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('starts with defaults, then loads the saved preferences', async () => {
    const saved = { ...DEFAULT_PREFERENCES, navigationBar: false, captureAction: 'copy' as const };
    getPreferences.mockResolvedValue({ ok: true, value: saved });

    const { result } = renderHook(() => usePreferences(), { wrapper });
    expect(result.current.loaded).toBe(false);
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.preferences).toEqual(saved);
  });

  it('reads the preferences once for every consumer', async () => {
    getPreferences.mockResolvedValue({ ok: true, value: DEFAULT_PREFERENCES });

    const { result } = renderHook(() => [usePreferences(), usePreferences()] as const, { wrapper });

    await waitFor(() => expect(result.current[0].loaded).toBe(true));
    expect(getPreferences).toHaveBeenCalledOnce();
  });

  it('is loaded with defaults when the saved preferences cannot be read', async () => {
    getPreferences.mockResolvedValue({ ok: false, error: 'boom' });

    const { result } = renderHook(() => usePreferences(), { wrapper });

    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it('is loaded with defaults when the bridge call throws', async () => {
    getPreferences.mockRejectedValue(new Error('ipc closed'));

    const { result } = renderHook(() => usePreferences(), { wrapper });

    await waitFor(() => expect(result.current.loaded).toBe(true));
  });

  it('applies a change at once and saves only that patch', async () => {
    getPreferences.mockResolvedValue({ ok: true, value: DEFAULT_PREFERENCES });
    const { result } = renderHook(() => usePreferences(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.update({ alwaysOnTop: true }));

    expect(result.current.preferences.alwaysOnTop).toBe(true);
    expect(result.current.preferences.navigationBar).toBe(true);
    expect(setPreferences).toHaveBeenCalledWith({ alwaysOnTop: true });
  });

  it('keeps the change on screen when saving fails', async () => {
    getPreferences.mockResolvedValue({ ok: true, value: DEFAULT_PREFERENCES });
    setPreferences.mockRejectedValue(new Error('ipc closed'));
    const { result } = renderHook(() => usePreferences(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => result.current.update({ navigationBar: false }));

    expect(result.current.preferences.navigationBar).toBe(false);
  });

  it('follows a language change made in another window', async () => {
    getPreferences.mockResolvedValue({ ok: true, value: DEFAULT_PREFERENCES });
    const { result } = renderHook(() => usePreferences(), { wrapper });
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => emitLanguage('en'));

    expect(result.current.preferences.language).toBe('en');
    expect(result.current.preferences.navigationBar).toBe(true);
  });

  it('keeps a language announced before the first read finished', async () => {
    let finish: (value: unknown) => void = () => undefined;
    getPreferences.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { result } = renderHook(() => usePreferences(), { wrapper });

    act(() => emitLanguage('en'));
    await act(async () => finish({ ok: true, value: { ...DEFAULT_PREFERENCES, language: 'es' } }));

    expect(result.current.preferences.language).toBe('en');
  });
});
