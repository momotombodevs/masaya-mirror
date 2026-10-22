import { useEffect, useMemo, type ReactNode } from 'react';
import { DEFAULT_LOCALE, resolveLocale } from '../../../shared/i18n/locale';
import { createTranslator } from '../../../shared/i18n/messages';
import { I18nContext, type I18n } from './i18n';
import { usePreferences } from './preferences';

function systemLocale(): string {
  return typeof navigator === 'undefined' ? DEFAULT_LOCALE : navigator.language;
}

/** Speaks the saved language; it follows the preferences, including changes from other windows. */
export function I18nProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const { language } = usePreferences().preferences;

  const value = useMemo<I18n>(() => {
    const locale = resolveLocale(language, systemLocale());
    return { locale, t: createTranslator(locale) };
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = value.locale;
  }, [value.locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
