import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BUSINESS_UNITS } from '../lib/constants';
import { fetchAllowedUsers, saveAllowedUser, removeAllowedUser } from '../lib/queries';
import type { AllowedUser, UserRole } from '../lib/types';
import { Skeleton } from '../components/Skeleton';

const ROLE_LABELS: Record<UserRole, string> = {
  finance: 'Finance (full access)',
  gm: 'General Manager (all BUs)',
  bu_head: 'BU Head (assigned BUs only)',
};

// GFFC (Chickboy Meating Place) is a separate company, assignable so a BU Head
// can be given GFFC-only access.
const GFFC_UNIT = { code: 'GFFC', name: 'Chickboy Meating Place', isProfitCenter: true };

// Selectable BUs = the profit centers that have a P&L, plus GFFC. Assigning BU08
// also grants its children (Farm / Packhouse) via the RLS parent rule.
const SELECTABLE_BUS = [...BUSINESS_UNITS.filter((b) => b.isProfitCenter), GFFC_UNIT];

const buName = (code: string) => (code === 'GFFC' ? GFFC_UNIT.name : BUSINESS_UNITS.find((b) => b.code === code)?.name ?? code);

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
      <Link to="/" className="inline-block text-sm text-slate-500 dark:text-slate-400">← Back to Home</Link>
      <div>
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Users</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Authorize who can sign in and what they see. Each person sets their own 6-digit PIN the
          first time they sign in with the email you add here.
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Add / edit form */}
      <form onSubmit={submit} className="space-y-4 rounded-2xl bg-white dark:bg-slate-800 p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{editingEmail ? `Edit ${editingEmail}` : 'Add a user'}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Email</label>
            <input
              type="email"
              value={form.email}
              disabled={!!editingEmail}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm disabled:bg-slate-100"
              placeholder="head@polcas.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Full name (optional)</label>
            <input
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
              placeholder="Juan Dela Cruz"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Designation</label>
          <select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
            className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm"
          >
            {(Object.keys(ROLE_LABELS) as UserRole[]).map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>

        {form.role === 'bu_head' && (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">Approved BUs (sees only these)</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {SELECTABLE_BUS.map((bu) => {
                const on = form.bus.includes(bu.code);
                return (
                  <button
                    key={bu.code}
                    type="button"
                    onClick={() => toggleBu(bu.code)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
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
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Saving…' : editingEmail ? 'Save changes' : 'Add user'}
          </button>
          {editingEmail && (
            <button type="button" onClick={resetForm} className="text-sm text-slate-500 dark:text-slate-400">Cancel</button>
          )}
        </div>
      </form>

      {/* Users list */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl bg-white dark:bg-slate-800 shadow-sm">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3">
              <div className="space-y-1.5"><Skeleton className="h-3 w-44" /><Skeleton className="h-2 w-24" /></div>
              <Skeleton className="h-7 w-20" />
            </div>
          ))
        ) : users.length === 0 ? (
          <p className="px-4 py-6 text-slate-400 dark:text-slate-500">No users yet. Add the first one above.</p>
        ) : (
          users.map((u) => (
            <div key={u.email} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-900 dark:text-slate-100">{u.full_name || u.email}</span>
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${u.registered_at ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                    {u.registered_at ? 'PIN set' : 'Pending'}
                  </span>
                </div>
                {u.full_name && <div className="text-xs text-slate-400 dark:text-slate-500">{u.email}</div>}
                <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {ROLE_LABELS[u.role]}
                  {u.role === 'bu_head' && u.bus.length > 0 && (
                    <> — {u.bus.map((c) => c).join(', ')}</>
                  )}
                </div>
                {u.role === 'bu_head' && u.bus.length > 0 && (
                  <div className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{u.bus.map(buName).join(' · ')}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => startEdit(u)} className="rounded-lg bg-slate-100 dark:bg-slate-700 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200">Edit</button>
                <button onClick={() => remove(u.email)} className="rounded-lg px-3 py-1.5 text-sm text-red-600">Remove</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
