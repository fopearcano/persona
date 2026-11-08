import { UI_LANGUAGES } from '@persona/shared/client';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import it from './locales/it.json';

/**
 * Localizzazione dell'interfaccia. Italiano predefinito, inglese disponibile.
 * Per aggiungere una lingua: creare locales/<codice>.json con le stesse chiavi,
 * registrarla qui e in UI_LANGUAGES (shared/src/constants.ts).
 */
export const resources = { it: { translation: it }, en: { translation: en } } as const;

const STORAGE_KEY = 'persona.uiLanguage';

function initialLanguage(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && (UI_LANGUAGES as readonly string[]).includes(stored)) return stored;
  } catch {
    /* localStorage non disponibile */
  }
  return 'it';
}

void i18n.use(initReactI18next).init({
  resources,
  lng: initialLanguage(),
  fallbackLng: 'it',
  supportedLngs: [...UI_LANGUAGES],
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignora */
  }
});

export default i18n;
