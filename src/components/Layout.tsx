import { Link, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Layout() {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const linkCls = 'rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700';

  return (
    <div className="min-h-svh bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <Link to="/" className="font-semibold text-slate-900">
          POLCAS <span className="font-normal text-slate-500">Business Review</span>
        </Link>
        <div className="flex items-center gap-3">
          {profile?.role === 'finance' && (
            <>
              {!isHome && <Link to="/" className={linkCls}>Home</Link>}
              <Link to="/import" className={linkCls}>Import</Link>
              <Link to="/trucking" className={linkCls}>Trucking</Link>
              <Link to="/farm" className={linkCls}>Farm</Link>
              <Link to="/publish" className={linkCls}>Publish</Link>
            </>
          )}
          <button onClick={() => signOut()} className="text-sm text-slate-400">
            Sign out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
