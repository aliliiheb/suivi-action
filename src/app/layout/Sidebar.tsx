import { NavLink } from 'react-router-dom';
import {
  CalendarCheck,
  Inbox,
  LayoutGrid,
  Target,
  Settings,
  Timer,
  Repeat,
  Calendar,
  BarChart3,
  BookOpen,
  Archive,
  Home,
  GraduationCap,
  Sunrise,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/shared/lib/cn';

interface NavItem {
  to: string;
  labelKey: string;
  icon: LucideIcon;
}

// Only routes that are fully implemented appear here; the sidebar grows as
// features land (no decorative / dead nav entries, spec §77).
const NAV: NavItem[] = [
  { to: '/', labelKey: 'home.title', icon: Home },
  { to: '/today', labelKey: 'nav.today', icon: CalendarCheck },
  { to: '/inbox', labelKey: 'nav.inbox', icon: Inbox },
  { to: '/areas', labelKey: 'nav.areas', icon: LayoutGrid },
  { to: '/goals', labelKey: 'nav.goals', icon: Target },
  { to: '/learn', labelKey: 'nav.learningHub', icon: GraduationCap },
  { to: '/quran', labelKey: 'spirit.quran', icon: BookOpen },
  { to: '/adhkar', labelKey: 'spirit.adhkar', icon: Sunrise },
  { to: '/sunnah', labelKey: 'sunnah.title', icon: Sunrise },
  { to: '/focus', labelKey: 'focus.title', icon: Timer },
  { to: '/habits', labelKey: 'habits.title', icon: Repeat },
  { to: '/calendar', labelKey: 'calendar.title', icon: Calendar },
  { to: '/coach', labelKey: 'nav.coach', icon: GraduationCap },
  { to: '/companions', labelKey: 'nav.companions', icon: BookOpen },
  { to: '/scholars', labelKey: 'nav.scholars', icon: BookOpen },
  { to: '/analytics', labelKey: 'analytics.title', icon: BarChart3 },
  { to: '/reviews', labelKey: 'reviews.title', icon: BookOpen },
  { to: '/archive', labelKey: 'data.archiveTitle', icon: Archive },
  { to: '/notes', labelKey: 'nav.notes', icon: BookOpen },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

/**
 * Collapsing rail sidebar: a 64px icon rail that expands to 240px on hover and
 * collapses when the pointer leaves, overlaying content so nothing reflows.
 * The width transition is animated; labels fade in. Keyboard focus inside also
 * expands it (focus-within) so it stays accessible (spec §70).
 */
export function Sidebar() {
  const { t } = useTranslation();
  return (
    // Reserves the collapsed rail width in the layout; the aside overlays on hover.
    <div className="sidebar-container relative w-16 shrink-0">
      <aside
        className={cn(
          'sidebar-rail group absolute inset-y-0 start-0 z-30 flex w-16 flex-col overflow-hidden',
          'border-e border-border bg-surface',
          'transition-[width,box-shadow] duration-200 ease-out',
          'hover:w-60 hover:shadow-xl focus-within:w-60 focus-within:shadow-xl',
        )}
      >
        {/* Brand */}
        <div className="sidebar-brand flex h-14 items-center">
          <span className="grid h-14 w-16 shrink-0 place-items-center">
            <span className="sidebar-logo grid h-8 w-8 place-items-center text-sm font-bold text-white">
              P
            </span>
          </span>
          <span className="whitespace-nowrap text-sm font-semibold tracking-wide opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
            {t('common.appName')}
          </span>
        </div>

        {/* Nav */}
        <nav className="sidebar-nav flex-1 space-y-1 overflow-y-auto py-2 pe-2">
          {NAV.map(({ to, labelKey, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              title={t(labelKey)}
              className={({ isActive }) =>
                cn(
                  'sidebar-link flex h-11 items-center transition-colors',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-fg-muted hover:bg-surface-2 hover:text-fg',
                )
              }
            >
              <span className="grid h-11 w-16 shrink-0 place-items-center">
                <Icon className="h-5 w-5" />
              </span>
              <span className="whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                {t(labelKey)}
              </span>
            </NavLink>
          ))}
          <a
            href="/plans.html"
            title="Plans d’actions collaboratifs"
            className="sidebar-link flex h-11 items-center text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <span className="grid h-11 w-16 shrink-0 place-items-center">
              <UsersIcon />
            </span>
            <span className="whitespace-nowrap text-sm font-medium opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
              Plans d’actions
            </span>
          </a>
        </nav>
      </aside>
    </div>
  );
}

function UsersIcon() {
  return <LayoutGrid className="h-5 w-5" />;
}
