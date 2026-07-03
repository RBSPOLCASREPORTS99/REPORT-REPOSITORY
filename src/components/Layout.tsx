import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';

const ROLE_LABELS: Record<string, string> = {
  finance: 'Finance',
  gm: 'General Manager',
  bu_head: 'BU Head',
};

export default function Layout() {
  const { profile, user, signOut } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Close the menu whenever the route changes.
  useEffect(() => setOpen(false), [location.pathname]);

  const isFinance = profile?.role === 'finance';

  const financeLinks = [
    { to: '/import', label: 'Import data' },
    { to: '/trucking', label: 'Trucking' },
    { to: '/farm', label: 'Lakatan Farm' },
    { to: '/publish', label: 'Publish periods' },
    { to: '/users', label: 'Users & access' },
  ];

  const itemCls = 'block rounded-lg px-3 py-2.5 text-sm font-medium text-brand-900 hover:bg-brand-50';

  return (
    <div className="min-h-svh bg-slate-50">
      <header className="sticky top-0 z-20 bg-brand-700 text-white shadow-sm">
        <div className="flex items-center justify-between px-4 py-2.5">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo className="h-9 w-9 shrink-0 bg-white/90 ring-1 ring-white/40" />
            <span className="leading-tight">
              <span className="block text-sm font-bold tracking-wide">POLCAS AGRI TRADE CORP.</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-100">Business Review</span>
            </span>
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white"
          >
            {open ? (
              <span className="text-lg leading-none">✕</span>
            ) : (
              <span className="flex flex-col gap-[3px]">
                <span className="block h-0.5 w-5 bg-white" />
                <span className="block h-0.5 w-5 bg-white" />
                <span className="block h-0.5 w-5 bg-white" />
              </span>
            )}
          </button>
        </div>

        {open && (
          <>
            {/* click-away backdrop */}
            <button
              aria-hidden
              onClick={() => setOpen(false)}
              className="fixed inset-0 top-14 z-10 cursor-default bg-black/20"
            />
            <nav className="relative z-20 mx-auto max-w-3xl space-y-1 border-t border-brand-600 bg-white px-3 py-3 shadow-lg">
              <div className="px-3 pb-2">
                <div className="truncate text-sm font-medium text-slate-800">{user?.email}</div>
                <div className="text-xs text-slate-400">{profile ? (ROLE_LABELS[profile.role] ?? profile.role) : ''}</div>
              </div>

              <Link to="/" className={itemCls}>Home</Link>

              {isFinance && (
                <>
                  <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Finance</div>
                  {financeLinks.map((l) => (
                    <Link key={l.to} to={l.to} className={itemCls}>{l.label}</Link>
                  ))}
                </>
              )}

              <div className="my-1 border-t border-slate-100" />
              <Link to="/account" className={itemCls}>My account (PIN)</Link>
              <button
                onClick={() => { setOpen(false); signOut(); }}
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
              >
                Sign out
              </button>
            </nav>
          </>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
