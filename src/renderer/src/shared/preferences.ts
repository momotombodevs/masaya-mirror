import { createContext, useContext } from 'react';
import { DEFAULT_PREFERENCES, type Preferences } from '../../../shared/preferences/types';

export type PreferencesStore = {
  readonly preferences: Preferences;
  /** False until the saved preferences arrive (or fail to), so windows do not start with stale ones. */
  readonly loaded: boolean;
  /** Applies a change at once and stores it in the background. */
  readonly update: (patch: Partial<Preferences>) => void;
};

/** Without a provider (tests, early render) the app uses the defaults and saves nothing. */
export const PreferencesContext = createContext<PreferencesStore>({
  preferences: DEFAULT_PREFERENCES,
  loaded: false,
  update: () => undefined,
});

export function usePreferences(): PreferencesStore {
  return useContext(PreferencesContext);
}
