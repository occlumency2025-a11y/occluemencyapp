import { NavLink, Outlet } from 'react-router-dom';
import { CalendarCheck, Compass, Sun, User } from 'lucide-react';

const TABS = [
  { to: '/', label: 'Today', Icon: Sun, end: true },
  { to: '/providers', label: 'Find', Icon: Compass, end: false },
  { to: '/bookings', label: 'Bookings', Icon: CalendarCheck, end: false },
  { to: '/profile', label: 'You', Icon: User, end: false },
];

export default function AppShell() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col bg-clay-50">
      <main className="flex-1 px-5 pb-32 pt-8">
        <Outlet />
      </main>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 mx-auto w-full max-w-lg border-t border-clay-200 bg-white/95 backdrop-blur"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="grid grid-cols-4">
          {TABS.map(({ to, label, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  [
                    'flex flex-col items-center gap-1 py-3 text-[11px] font-semibold transition-colors',
                    isActive ? 'text-sage-700' : 'text-clay-400 hover:text-clay-600',
                  ].join(' ')
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
                    {label}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
