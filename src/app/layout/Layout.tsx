import { Outlet, useLocation, Link } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from './Sidebar';
import { SaveStatusIndicator } from './SaveStatusIndicator';
import { FocusBar } from '@/features/focus/FocusBar';
import { ThemeControl } from './ThemeControl';
import { GlobalSearch } from './GlobalSearch';
import { QuickAdd } from './QuickAdd';

export function Layout() {
  const { t, i18n } = useTranslation();
  const pathname = useLocation().pathname;
  const isHome = pathname === '/';
  return (
    <div
      className={`app-shell flex h-full min-h-0 ${isHome ? 'sanctuary-shell' : ''} ${pathname.startsWith('/goals') ? 'objectives-shell' : ''}`}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="shell-topbar flex shrink-0 items-center justify-end gap-4">
          <GlobalSearch />
          <span className="topbar-date">
            {new Date().toLocaleDateString(i18n.language, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
          <FocusBar />
          <SaveStatusIndicator />
          <ThemeControl />
          <Link className="topbar-profile" to="/settings" aria-label={t('nav.settings')}>
            <UserRound size={18} />
            <span>{t('command.mySpace')}</span>
          </Link>
          <QuickAdd />
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
          <div className="workspace">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
