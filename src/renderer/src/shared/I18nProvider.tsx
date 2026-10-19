import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  DEFAULT_LOCALE,
  resolveLocale,
  type LanguagePreference,
} from '../../../shared/i18n/locale';
import { createTranslator } from '../../../shared/i18n/messages';
import { I18nContext, type I18n } from './i18n';
import { getManoloApi } from './manolo-api';

function systemLocale(): string {
  return typeof navigator === 'undefined' ? DEFAULT_LOCALE : navigator.language;
}

/** Follows the saved language, including changes made from another window. */
export function I18nProvider({ children }: { readonly children: ReactNode }): JSX.Element {
  const [language, setLanguage] = useState<LanguagePreference>('system');

  useEffect(() => {
    const api = getManoloApi();
    let cancelled = false;
    void api
      ?.getPreferences()
      .then((result) => {
        if (!cancelled && result.ok) {
          setLanguage(result.value.language);
        }
      })
      .catch(() => undefined);
    const unsubscribe = api?.onLanguageChange(setLanguage);
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const value = useMemo<I18n>(() => {
    const locale = resolveLocale(language, systemLocale());
    return { locale, t: createTranslator(locale) };
  }, [language]);

  useEffect(() => {
    document.documentElement.lang = value.locale;
  }, [value.locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
