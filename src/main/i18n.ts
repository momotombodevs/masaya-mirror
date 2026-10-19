import { DEFAULT_LOCALE, type Locale } from '../shared/i18n/locale';
import { translate, type MessageKey, type TranslateParams } from '../shared/i18n/messages';

let locale: Locale = DEFAULT_LOCALE;

/** Language of the messages the main process shows or sends to windows. */
export function setMainLocale(next: Locale): void {
  locale = next;
}

/** Translates a message into the current language of the main process. */
export function mt(key: MessageKey, params?: TranslateParams): string {
  return translate(locale, key, params);
}
