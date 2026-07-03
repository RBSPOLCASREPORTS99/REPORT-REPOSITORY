import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

type Mode = 'signin' | 'setup' | 'magiclink';

export default function Login() {
  const { signInWithPin, registerWithPin, signInWithEmail } = useAuth();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // magic-link fallback state
  const [linkSent, setLinkSent] = useState(false);
  const [code, setCode] = useState('');

  const pinValid = /^\d{6}$/.test(pin);

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!pinValid) { setError('PIN must be exactly 6 digits.'); return; }
    setBusy(true);
    const { error } = mode === 'setup'
      ? await registerWithPin(email, pin)
      : await signInWithPin(email, pin);
    if (error) setError(error);
    setBusy(false);
  }

  async function handleSendLink(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await signInWithEmail(email.trim());
    if (error) setError(error);
    else setLinkSent(true);
    setBusy(false);
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    if (error) setError(error.message);
    setBusy(false);
  }

  const emailField = (
    <div>
      <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 text-base focus:border-slate-500 focus:outline-none"
        placeholder="you@polcas.com"
      />
    </div>
  );

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">POLCAS AGRITRADE</h1>
        <p className="mt-1 text-sm text-slate-500">Business Review Reports</p>

        {mode === 'magiclink' ? (
          linkSent ? (
            <div className="mt-8 space-y-4">
              <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
                Check your email. If the link doesn't work (some email apps "click" links
                automatically, which breaks one-time links), enter the 6-digit code from the same
                email instead.
              </p>
              <form onSubmit={handleVerifyCode} className="space-y-3">
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  className="block w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-lg tracking-widest focus:border-slate-500 focus:outline-none"
                />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <button type="submit" disabled={busy || code.trim().length === 0}
                  className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
                  {busy ? 'Verifying…' : 'Verify code'}
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleSendLink} className="mt-8 space-y-4">
              {emailField}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={busy}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
                {busy ? 'Sending link…' : 'Send sign-in link'}
              </button>
              <button type="button" onClick={() => { setMode('signin'); setError(''); }}
                className="w-full text-center text-sm text-slate-500">
                ← Back to PIN sign-in
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handlePinSubmit} className="mt-8 space-y-4">
            {emailField}
            <div>
              <label htmlFor="pin" className="block text-sm font-medium text-slate-700">
                {mode === 'setup' ? 'Choose a 6-digit PIN' : 'PIN'}
              </label>
              <input
                id="pin"
                type="password"
                inputMode="numeric"
                autoComplete={mode === 'setup' ? 'new-password' : 'current-password'}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="mt-1 block w-full rounded-lg border border-slate-300 px-4 py-3 text-center text-lg tracking-[0.5em] focus:border-slate-500 focus:outline-none"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={busy || !pinValid}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50">
              {busy ? 'Please wait…' : mode === 'setup' ? 'Set PIN & sign in' : 'Sign in'}
            </button>

            <div className="flex items-center justify-between pt-1 text-sm">
              {mode === 'signin' ? (
                <button type="button" onClick={() => { setMode('setup'); setError(''); }} className="text-slate-700 underline">
                  First time? Set up my PIN
                </button>
              ) : (
                <button type="button" onClick={() => { setMode('signin'); setError(''); }} className="text-slate-700 underline">
                  ← I already have a PIN
                </button>
              )}
              <button type="button" onClick={() => { setMode('magiclink'); setError(''); setLinkSent(false); }} className="text-slate-400">
                Email me a link
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
