import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    const { error } = await signInWithEmail(email.trim());
    if (error) {
      setError(error);
      setStatus('error');
    } else {
      setStatus('sent');
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setVerifying(true);
    setVerifyError('');
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    if (error) setVerifyError(error.message);
    setVerifying(false);
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">POLCAS AGRITRADE</h1>
        <p className="mt-1 text-sm text-slate-500">Business Review Reports</p>

        {status === 'sent' ? (
          <div className="mt-8 space-y-4">
            <p className="rounded-lg bg-green-50 p-4 text-sm text-green-800">
              Check your email. If the link doesn't work (some email apps "click" links
              automatically to scan them, which breaks one-time links), enter the 6-digit code
              from the same email instead.
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
              {verifyError && <p className="text-sm text-red-600">{verifyError}</p>}
              <button
                type="submit"
                disabled={verifying || code.trim().length === 0}
                className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
              >
                {verifying ? 'Verifying…' : 'Verify code'}
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
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
            {status === 'error' && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full rounded-lg bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
            >
              {status === 'sending' ? 'Sending link…' : 'Send sign-in link'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
