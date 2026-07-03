import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabaseClient';
import { BUSINESS_UNITS } from '../lib/constants';

const ROLE_LABELS: Record<string, string> = {
  finance: 'Finance',
  gm: 'General Manager',
  bu_head: 'BU Head',
};
const buName = (code: string) => BUSINESS_UNITS.find((b) => b.code === code)?.name ?? code;

// Lets any signed-in user set or change their 6-digit PIN (Supabase password).
// This is how existing magic-link accounts get a PIN for the first time.
export default function Account() {
  const { user, profile } = useAuth();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMsg('');
    if (!/^\d{6}$/.test(pin)) { setError('PIN must be exactly 6 digits.'); return; }
    if (pin !== pin2) { setError('The two PINs do not match.'); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pin });
    if (error) setError(error.message);
    else { setMsg('PIN updated. Use it next time you sign in.'); setPin(''); setPin2(''); }
    setBusy(false);
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-block text-sm text-slate-500">← Back to Home</Link>
      <h1 className="text-lg font-semibold text-slate-900">My account</h1>

      <div className="rounded-2xl bg-white p-5 text-sm shadow-sm">
        <div className="text-slate-500">Email</div>
        <div className="font-medium text-slate-900">{user?.email}</div>
        <div className="mt-3 text-slate-500">Designation</div>
        <div className="font-medium text-slate-900">{profile ? (ROLE_LABELS[profile.role] ?? profile.role) : '—'}</div>
        {profile?.role === 'bu_head' && (
          <div className="mt-1 text-xs text-slate-500">
            {profile.bus.length ? profile.bus.map((c) => `${c} · ${buName(c)}`).join('  |  ') : 'No BUs assigned yet'}
          </div>
        )}
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Set / change PIN</h2>
        <div>
          <label className="block text-xs font-medium text-slate-600">New 6-digit PIN</label>
          <input type="password" inputMode="numeric" value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.5em]" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Confirm PIN</label>
          <input type="password" inputMode="numeric" value={pin2}
            onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-center text-lg tracking-[0.5em]" />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {msg && <p className="text-sm text-green-700">{msg}</p>}
        <button type="submit" disabled={busy}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {busy ? 'Saving…' : 'Save PIN'}
        </button>
      </form>
    </div>
  );
}
