import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import Logo from '../components/Logo';

// Email-only (passwordless) sign-in. Enter a registered email → we send a
// one-time login link + 6-digit code → click the link or enter the code.
// Only emails on the Users allow-list can sign in (gated in signInWithEmail).
export default function Login() {
  const { session, signInWithEmail } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (session) navigate('/', { replace: true });
  }, [session, navigate]);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    const { error } = await signInWithEmail(email.trim());
    if (error) setError(error); else setSent(true);
    setBusy(false);
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-gradient-to-b from-brand-50 to-white px-4 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-sm rounded-3xl border border-brand-100 bg-white p-8 shadow-lg shadow-brand-900/5 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">
          <Logo className="h-14 w-14 shrink-0" />
          <div className="leading-tight">
            <h1 className="text-lg font-bold text-brand-800">POLCAS AGRI TRADE CORP.</h1>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-600">Business Review</p>
          </div>
        </div>
        <div className="my-6 h-px bg-brand-100" />

        {!sent ? (
          <form onSubmit={handleSend} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 dark:text-slate-200">Email</label>
              <input
                id="email" type="email" required autoComplete="email" autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-base focus:border-brand-500 focus:outline-none"
                placeholder="you@polcas.com"
              />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Sign in with your registered email — we'll send a one-time link and code. No password needed.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy}
              className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
              {busy ? 'Sending…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <div className="mt-8 space-y-4">
            <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-300">
              We emailed <span className="font-semibold">{email.trim().toLowerCase()}</span> an 8-digit code.
              Enter it below to sign in here. (You can also click the link in the email, but it opens a
              separate browser — the code signs you in right in this window.)
            </p>
            <form onSubmit={handleVerify} className="space-y-3">
              <input
                type="text" inputMode="numeric" autoComplete="one-time-code" autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                placeholder="12345678"
                className="block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-3 text-center text-lg tracking-widest focus:border-brand-500 focus:outline-none"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={busy || code.trim().length < 8}
                className="w-full rounded-lg bg-brand-600 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
                {busy ? 'Verifying…' : 'Verify & sign in'}
              </button>
            </form>
            <button type="button" onClick={() => { setSent(false); setCode(''); setError(''); }}
              className="w-full text-center text-sm text-slate-500 dark:text-slate-400">
              ← Use a different email
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
