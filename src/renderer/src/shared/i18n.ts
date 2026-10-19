import { createContext, useContext } from 'react';
import { DEFAULT_LOCALE, type Locale } from '../../../shared/i18n/locale';
import { createTranslator, type Translate } from '../../../shared/i18n/messages';

export type I18n = {
  readonly locale: Locale;
  readonly t: Translate;
};

/** Without a provider (tests, early render) the app speaks its default language. */
export const I18nContext = createContext<I18n>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(DEFAULT_LOCALE),
});

export function useI18n(): I18n {
  return useContext(I18nContext);
}
