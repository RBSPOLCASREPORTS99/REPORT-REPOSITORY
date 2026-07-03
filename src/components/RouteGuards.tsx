import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function RequireAuth() {
  const { session, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function RequireFinance() {
  const { profile, loading } = useAuth();
  if (loading) return <FullScreenSpinner />;
  if (profile?.role !== 'finance') return <Navigate to="/" replace />;
  return <Outlet />;
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center text-slate-400 dark:text-slate-500">
      Loading…
    </div>
  );
}
