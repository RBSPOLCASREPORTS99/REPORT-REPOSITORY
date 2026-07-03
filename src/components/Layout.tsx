import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUi } from '../contexts/UiContext';
import Logo from './Logo';

const ROLE_LABELS: Record<string, string> = {
  finance: 'Finance',
  gm: 'General Manager',
  bu_head: 'BU Head',
};

interface NavItem { to: string; label: string; icon: string; end?: boolean }

export default function Layout() {
  const { profile, user, signOut } = useAuth();
  const { dark, toggleDark, zoom, zoomIn, zoomOut, resetZoom, sidebarCollapsed, toggleSidebar } = useUi();
  const location = useLocation();
  const [open, setOpen] = useState(false); // mobile menu

  useEffect(() => setOpen(false), [location.pathname]);

  const isFinance = profile?.role === 'finance';

  const items: NavItem[] = [
    { to: '/', label: 'Home', icon: '🏠', end: true },
    ...(isFinance
      ? [
          { to: '/import', label: 'Import data', icon: '⬆️' },
          { to: '/trucking', label: 'Trucking', icon: '🚚' },
          { to: '/farm', label: 'Lakatan Farm', icon: '🌱' },
          { to: '/publish', label: 'Publish periods', icon: '📢' },
          { to: '/users', label: 'Users & access', icon: '👥' },
        ]
      : []),
    { to: '/account', label: 'My account (PIN)', icon: '👤' },
  ];

  const navLinkCls = (active: boolean, collapsed = false) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${collapsed ? 'justify-center' : ''} ${
      active
        ? 'bg-brand-600 text-white'
        : 'text-brand-900 hover:bg-brand-50 dark:text-slate-200 dark:hover:bg-slate-700'
    }`;

  // Zoom + light/dark controls, reused in sidebar footer and mobile menu.
  const controls = (compact = false) => (
    <div className={`space-y-2 ${compact ? '' : 'px-1'}`}>
      <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-700">
        <button onClick={zoomOut} aria-label="Zoom out"
          className="h-8 w-8 rounded-md bg-white text-lg font-semibold text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">−</button>
        <button onClick={resetZoom} aria-label="Reset zoom"
          className="flex-1 rounded-md py-1 text-center text-xs font-semibold text-slate-600 dark:text-slate-300">{zoom}%</button>
        <button onClick={zoomIn} aria-label="Zoom in"
          className="h-8 w-8 rounded-md bg-white text-lg font-semibold text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200">+</button>
      </div>
      <button onClick={toggleDark}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
        {dark ? '☀️ Light mode' : '🌙 Night mode'}
      </button>
      <button onClick={() => signOut()}
        className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40">
        Sign out
      </button>
    </div>
  );

  return (
    <div className="min-h-svh bg-slate-50 dark:bg-slate-900 lg:flex">
      {/* ---------------- Desktop collapsible sidebar ---------------- */}
      <aside
        className={`sticky top-0 hidden h-svh shrink-0 flex-col border-r border-slate-200 bg-white transition-all lg:flex dark:border-slate-700 dark:bg-slate-800 ${
          sidebarCollapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className={`flex items-center gap-2 border-b border-slate-100 px-3 py-3 dark:border-slate-700 ${sidebarCollapsed ? 'justify-center' : ''}`}>
          <Logo className="h-9 w-9 shrink-0" />
          {!sidebarCollapsed && (
            <span className="leading-tight">
              <span className="block text-sm font-bold text-brand-800 dark:text-brand-300">POLCAS AGRI TRADE</span>
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">Business Review</span>
            </span>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-2">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end}
              title={sidebarCollapsed ? it.label : undefined}
              className={({ isActive }) => navLinkCls(isActive, sidebarCollapsed)}>
              <span className="text-base leading-none">{it.icon}</span>
              {!sidebarCollapsed && <span className="truncate">{it.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-2 dark:border-slate-700">
          {!sidebarCollapsed && (
            <div className="mb-2 px-2">
              <div className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{user?.email}</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">{profile ? (ROLE_LABELS[profile.role] ?? profile.role) : ''}</div>
            </div>
          )}
          {!sidebarCollapsed ? controls() : (
            <button onClick={toggleDark} title="Toggle light/dark" className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
              {dark ? '☀️' : '🌙'}
            </button>
          )}
          <button onClick={toggleSidebar}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="mt-2 flex w-full items-center justify-center rounded-lg py-1.5 text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-700">
            {sidebarCollapsed ? '»' : '« Collapse'}
          </button>
        </div>
      </aside>

      {/* ---------------- Main column ---------------- */}
      <div className="min-w-0 flex-1">
        {/* Mobile top bar + hamburger menu */}
        <header className="sticky top-0 z-20 bg-brand-700 text-white shadow-sm lg:hidden">
          <div className="flex items-center justify-between px-4 py-2.5">
            <Link to="/" className="flex items-center gap-2.5">
              <Logo className="h-9 w-9 shrink-0 bg-white/90 ring-1 ring-white/40" />
              <span className="leading-tight">
                <span className="block text-sm font-bold tracking-wide">POLCAS AGRI TRADE CORP.</span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-brand-100">Business Review</span>
              </span>
            </Link>
            <button onClick={() => setOpen((v) => !v)} aria-label="Menu" aria-expanded={open}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
              {open ? <span className="text-lg leading-none">✕</span> : (
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
              <button aria-hidden onClick={() => setOpen(false)} className="fixed inset-0 top-14 z-10 cursor-default bg-black/20" />
              <nav className="relative z-20 space-y-1 border-t border-brand-600 bg-white px-3 py-3 text-left shadow-lg dark:bg-slate-800">
                <div className="px-2 pb-1">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{user?.email}</div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">{profile ? (ROLE_LABELS[profile.role] ?? profile.role) : ''}</div>
                </div>
                {items.map((it) => (
                  <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => navLinkCls(isActive)}>
                    <span className="text-base leading-none">{it.icon}</span>
                    <span>{it.label}</span>
                  </NavLink>
                ))}
                <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
                {controls(true)}
              </nav>
            </>
          )}
        </header>

        <main style={{ zoom: zoom / 100 }} className="mx-auto w-full max-w-3xl px-4 py-6 lg:max-w-5xl xl:max-w-6xl">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
