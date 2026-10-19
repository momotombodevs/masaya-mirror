export type Locale = 'es' | 'en';

/** What the user picks: a fixed language, or follow the system. */
export type LanguagePreference = 'system' | Locale;

export const LANGUAGE_PREFERENCES: readonly LanguagePreference[] = ['system', 'es', 'en'];

export const DEFAULT_LOCALE: Locale = 'es';

/** Any system language other than Spanish gets English. `systemLocale` is a BCP 47 tag like "es-NI". */
export function resolveLocale(preference: LanguagePreference, systemLocale: string): Locale {
  if (preference !== 'system') {
    return preference;
  }
  return systemLocale.toLowerCase().startsWith('es') ? 'es' : 'en';
}
