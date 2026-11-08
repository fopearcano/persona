import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { useUi } from './ui';

describe('ui preferences', () => {
  it('persists theme locally and toggles the dark class', () => {
    useUi.getState().setTheme('light');
    expect(localStorage.getItem('persona.theme')).toBe('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    useUi.getState().setTheme('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('persists the interface language', async () => {
    useUi.getState().setLanguage('en');
    await new Promise((r) => setTimeout(r, 0));
    expect(i18n.language).toBe('en');
    expect(localStorage.getItem('persona.uiLanguage')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    useUi.getState().setLanguage('it');
  });
});
