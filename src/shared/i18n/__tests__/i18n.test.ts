import { describe, expect, it } from 'vitest';
import { resolveLocale } from '../locale';
import { translate } from '../messages';

describe('resolveLocale', () => {
  it('keeps a fixed language', () => {
    expect(resolveLocale('en', 'es-NI')).toBe('en');
    expect(resolveLocale('es', 'en-US')).toBe('es');
  });

  it('follows the system: Spanish for any Spanish locale, English otherwise', () => {
    expect(resolveLocale('system', 'es-MX')).toBe('es');
    expect(resolveLocale('system', 'ES')).toBe('es');
    expect(resolveLocale('system', 'en-US')).toBe('en');
    expect(resolveLocale('system', 'fr-FR')).toBe('en');
  });
});

describe('translate', () => {
  it('returns the message of the locale', () => {
    expect(translate('es', 'toolbar.settings')).toBe('Ajustes');
    expect(translate('en', 'toolbar.settings')).toBe('Settings');
  });

  it('fills placeholders and leaves unknown ones untouched', () => {
    expect(translate('en', 'menu.quit', { app: 'Manolo Mirror' })).toBe('Quit Manolo Mirror');
    expect(translate('es', 'menu.quit')).toBe('Salir de {app}');
  });
});
