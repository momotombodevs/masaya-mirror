import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LanguagePreference } from '../../../shared/i18n/locale';
import { DEFAULT_PREFERENCES, type Preferences } from '../../../shared/preferences/types';
import { callApi, getManoloApi } from './manolo-api';
import { PreferencesContext, type PreferencesStore } from './preferences';

/**
 * The one copy of the saved preferences for a window: read once, shared by everything below
 * (language, toolbar, settings), and kept in step with language changes made in other windows.
 * The preload API only announces language changes, so other preferences are read at startup.
 */
export function PreferencesProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
  /** A language announced while the first read was still running is newer than that read. */
  const announcedLanguage = useRef<LanguagePreference | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await callApi((api) => api.getPreferences(), '');
      if (cancelled) {
        return;
      }
      if (result.ok) {
        const language = announcedLanguage.current ?? result.value.language;
        setPreferences({ ...result.value, language });
      }
      setLoaded(true);
    })();
    const unsubscribe = getManoloApi()?.onLanguageChange((language) => {
      announcedLanguage.current = language;
      setPreferences((current) => ({ ...current, language }));
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const update = useCallback((patch: Partial<Preferences>): void => {
    setPreferences((current) => ({ ...current, ...patch }));
    void callApi((api) => api.setPreferences(patch), '');
  }, []);

  const value = useMemo<PreferencesStore>(
    () => ({ preferences, loaded, update }),
    [preferences, loaded, update],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}
