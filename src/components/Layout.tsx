import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

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

  const itemCls = 'block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100';

  return (
    <div className="min-h-svh bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <Link to="/" className="font-semibold text-slate-900">
            POLCAS <span className="font-normal text-slate-500">Business Review</span>
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
            aria-expanded={open}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700"
          >
            {open ? (
              <span className="text-lg leading-none">✕</span>
            ) : (
              <span className="flex flex-col gap-[3px]">
                <span className="block h-0.5 w-5 bg-slate-700" />
                <span className="block h-0.5 w-5 bg-slate-700" />
                <span className="block h-0.5 w-5 bg-slate-700" />
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
              className="fixed inset-0 top-[57px] z-10 cursor-default bg-black/10"
            />
            <nav className="relative z-20 mx-auto max-w-3xl space-y-1 border-t border-slate-100 px-3 py-3">
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
