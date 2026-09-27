/**
 * i18n bootstrap (spec §47, §48). All user-facing text goes through i18next;
 * never hard-code strings in components. Switching language also flips the
 * document direction for real RTL (Arabic).
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { isRtl, LANGUAGE, type Language } from '@/domain/enums';
import fr from './locales/fr.json';
import en from './locales/en.json';
import ar from './locales/ar.json';

/** Set <html dir> and <html lang> for the active language (real RTL, §48). */
export function applyDirection(lng: string): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dir = isRtl(lng as Language) ? 'rtl' : 'ltr';
  document.documentElement.lang = lng;
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      ar: { translation: ar },
    },
    fallbackLng: 'fr',
    supportedLngs: LANGUAGE as unknown as string[],
    interpolation: { escapeValue: false },
    detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
  })
  .then(() => applyDirection(i18n.language));

i18n.on('languageChanged', applyDirection);

export default i18n;
