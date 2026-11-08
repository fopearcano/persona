import { BookUser, Brain, Drama, MessagesSquare, Orbit, Settings, UserPlus, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router';
import { cx, Toasts } from './ui';

const NAV = [
  { to: '/characters', key: 'characters', icon: Users, end: true },
  { to: '/characters/new', key: 'creator', icon: UserPlus, end: true },
  { to: '/dialogue', key: 'dialogue', icon: MessagesSquare },
  { to: '/scenarios', key: 'scenarios', icon: Orbit },
  { to: '/simulations', key: 'simulations', icon: Drama },
  { to: '/memory', key: 'memory', icon: Brain },
  { to: '/settings', key: 'settings', icon: Settings },
] as const;

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-panel focus:p-2">
        {t('common.skipToContent')}
      </a>
      <nav aria-label="PERSONA" className="flex w-14 shrink-0 flex-col border-r border-border bg-panel md:w-52">
        <div className="flex h-14 items-center gap-2 border-b border-border px-4">
          <BookUser className="size-5 shrink-0 text-accent" aria-hidden />
          <div className="hidden leading-tight md:block">
            <div className="text-sm font-semibold tracking-[0.18em]">{t('app.name')}</div>
            <div className="text-[11px] text-muted">{t('app.tagline')}</div>
          </div>
        </div>
        <ul className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map(({ to, key, icon: Icon, ...rest }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={'end' in rest ? rest.end : false}
                title={t(`nav.${key}`)}
                className={({ isActive }) =>
                  cx(
                    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm',
                    isActive ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-panel-2 hover:text-text',
                  )
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="hidden md:inline">{t(`nav.${key}`)}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" className="min-w-0 flex-1 overflow-auto">
        {children}
      </main>
      <Toasts />
    </div>
  );
}
