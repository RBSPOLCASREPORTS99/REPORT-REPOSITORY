import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BUSINESS_UNITS } from '../lib/constants';
import { fetchAllowedUsers, saveAllowedUser, removeAllowedUser } from '../lib/queries';
import type { AllowedUser, UserRole } from '../lib/types';

const ROLE_LABELS: Record<UserRole, string> = {
  finance: 'Finance (full access)',
  gm: 'General Manager (all BUs)',
  bu_head: 'BU Head (assigned BUs only)',
};

// Selectable BUs = the profit centers that have a P&L. Assigning BU08 also
// grants its children (Farm / Packhouse) via the RLS parent rule.
const SELECTABLE_BUS = BUSINESS_UNITS.filter((b) => b.isProfitCenter);

const buName = (code: string) => BUSINESS_UNITS.find((b) => b.code === code)?.name ?? code;

const emptyForm = { email: '', full_name: '', role: 'bu_head' as UserRole, bus: [] as string[] };

export default function Users() {
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reload() {
    setLoading(true);
    fetchAllowedUsers()
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }
  useEffect(reload, []);

  function startEdit(u: AllowedUser) {
    setEditingEmail(u.email);
    setForm({ email: u.email, full_name: u.full_name ?? '', role: u.role, bus: u.bus });
    setError('');
  }
  function resetForm() {
    setEditingEmail(null);
    setForm(emptyForm);
  }
  function toggleBu(code: string) {
    setForm((f) => ({ ...f, bus: f.bus.includes(code) ? f.bus.filter((c) => c !== code) : [...f.bus, code] }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!/.+@.+\..+/.test(form.email.trim())) { setError('Enter a valid email.'); return; }
    if (form.role === 'bu_head' && form.bus.length === 0) { setError('Assign at least one BU to a BU Head.'); return; }
    setSaving(true);
    try {
      await saveAllowedUser({
        email: form.email,
        role: form.role,
        full_name: form.full_name.trim() || null,
        bus: form.bus,
      });
      resetForm();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(email: string) {
    if (!confirm(`Remove ${email}? They will lose access to all BUs.`)) return;
    setError('');
    try {
      await removeAllowedUser(email);
      if (editingEmail === email) resetForm();
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed.');
    }
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="inline-block text-sm text-slate-500">← Back to Home</Link>
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Users</h1>
        <p className="mt-1 text-sm text-slate-500">
          Authorize who can sign in and what they see. Each person sets their own 6-digit PIN the
          first time they sign in with the email you add here.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Add / edit form */}
      <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">{editingEmail ? `Edit ${editingEmail}` : 'Add a user'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600">Email</label>
            <input
              type="email"
              value={form.email}
              disabled={!!editingEmail}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
              placeholder="head@polcas.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Full name (optional)</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Juan Dela Cruz"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600">Designation</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>

        {form.role === 'bu_head' && (
          <div>
            <label className="block text-xs font-medium text-slate-600">Approved BUs (sees only these)</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {SELECTABLE_BUS.map((bu) => {
                const on = form.bus.includes(bu.code);
                return (
                  <button
                    key={bu.code}
                    type="button"
                    onClick={() => toggleBu(bu.code)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${on ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >
                    {bu.code} · {bu.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <button type="submit" disabled={saving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Saving…' : editingEmail ? 'Save changes' : 'Add user'}
          </button>
          {editingEmail && (
            <button type="button" onClick={resetForm} className="text-sm text-slate-500">Cancel</button>
          )}
        </div>
      </form>

      {/* Users list */}
      <div className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm">
        {loading ? (
          <p className="px-4 py-6 text-slate-400">Loading…</p>
        ) : users.length === 0 ? (
          <p className="px-4 py-6 text-slate-400">No users yet. Add the first one above.</p>
        ) : (
          users.map((u) => (
            <div key={u.email} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900">{u.full_name || u.email}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${u.registered_at ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {u.registered_at ? 'PIN set' : 'Pending'}
                  </span>
                </div>
                {u.full_name && <div className="text-xs text-slate-400">{u.email}</div>}
                <div className="mt-1 text-xs text-slate-500">
                  {ROLE_LABELS[u.role]}
                  {u.role === 'bu_head' && u.bus.length > 0 && (
                    <> — {u.bus.map((c) => c).join(', ')}</>
                  )}
                </div>
                {u.role === 'bu_head' && u.bus.length > 0 && (
                  <div className="mt-1 text-[11px] text-slate-400">{u.bus.map(buName).join(' · ')}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(u)} className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm text-slate-700">Edit</button>
                <button onClick={() => remove(u.email)} className="rounded-lg px-3 py-1.5 text-sm text-red-600">Remove</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
