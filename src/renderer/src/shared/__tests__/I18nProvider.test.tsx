// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LanguagePreference } from '../../../../shared/i18n/locale';
import { DEFAULT_PREFERENCES } from '../../../../shared/preferences/types';
import { I18nProvider } from '../I18nProvider';
import { useI18n } from '../i18n';

function Label(): JSX.Element {
  return <p>{useI18n().t('toolbar.settings')}</p>;
}

function stubApi(language: LanguagePreference): { emit: (next: LanguagePreference) => void } {
  let listener: (next: LanguagePreference) => void = () => undefined;
  vi.stubGlobal('manolo', {
    getPreferences: () =>
      Promise.resolve({ ok: true, value: { ...DEFAULT_PREFERENCES, language } }),
    onLanguageChange: (next: (language: LanguagePreference) => void) => {
      listener = next;
      return () => undefined;
    },
  });
  return { emit: (next) => listener(next) };
}

describe('I18nProvider', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('speaks the saved language and follows changes from other windows', async () => {
    const api = stubApi('en');
    render(
      <I18nProvider>
        <Label />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByText('Settings')).toBeTruthy());

    act(() => api.emit('es'));
    expect(screen.getByText('Ajustes')).toBeTruthy();
    expect(document.documentElement.lang).toBe('es');
  });
});
