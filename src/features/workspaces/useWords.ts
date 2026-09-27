import { useTranslation } from 'react-i18next';
export function useWords() {
  const { i18n } = useTranslation();
  return (fr: string, en: string, ar: string) =>
    i18n.language.startsWith('ar') ? ar : i18n.language.startsWith('en') ? en : fr;
}
