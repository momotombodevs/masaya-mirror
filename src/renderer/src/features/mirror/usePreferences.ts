import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_PREFERENCES, type Preferences } from '../../../../shared/preferences/types';
import { getManoloApi } from '../../shared/manolo-api';

export type UsePreferencesResult = {
  readonly preferences: Preferences;
  /** False until the saved preferences arrive (or fail to), so windows do not start with stale ones. */
  readonly loaded: boolean;
  readonly update: (patch: Partial<Preferences>) => void;
};

/** Saved preferences. Changes apply at once and are stored in the background. */
export function usePreferences(): UsePreferencesResult {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await getManoloApi()
        ?.getPreferences()
        .catch(() => undefined);
      if (cancelled) {
        return;
      }
      if (result?.ok) {
        setPreferences(result.value);
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<Preferences>): void => {
    setPreferences((current) => ({ ...current, ...patch }));
    void getManoloApi()
      ?.setPreferences(patch)
      .catch(() => undefined);
  }, []);

  return { preferences, loaded, update };
}
