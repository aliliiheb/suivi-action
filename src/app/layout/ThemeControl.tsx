import { Sun, Moon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '@/app/stores/theme';

export function ThemeControl() {
  const { t } = useTranslation();
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  return (
    <div className="nav-theme-control" role="group" aria-label={t('settings.theme')}>
      <button
        type="button"
        title={t('settings.themeLight')}
        aria-label={t('settings.themeLight')}
        aria-pressed={theme === 'light'}
        onClick={() => setTheme('light')}
      >
        <Sun size={17} />
      </button>
      <button
        type="button"
        title={t('settings.themeDark')}
        aria-label={t('settings.themeDark')}
        aria-pressed={theme === 'dark'}
        onClick={() => setTheme('dark')}
      >
        <Moon size={17} />
      </button>
    </div>
  );
}
