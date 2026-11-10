import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.');
}

// Keep the session across app opens even in the embedded ERP browser, whose
// storage behaviour we don't control. Persist to BOTH localStorage and a
// long-lived cookie and read from whichever the host kept — so you stay signed
// in and are logged in automatically next time. Everything is wrapped in
// try/catch because a locked-down webview can throw on either store, and the
// cookie is skipped when the value is too large for one (then localStorage alone
// is used, i.e. the previous behaviour).
const COOKIE_MAX = 3600; // keep well under the ~4KB per-cookie limit (name + attrs included)

function readCookie(key: string): string | null {
  try {
    const prefix = `${key}=`;
    for (const part of document.cookie.split('; ')) {
      if (part.startsWith(prefix)) return decodeURIComponent(part.slice(prefix.length));
    }
  } catch { /* cookies unavailable */ }
  return null;
}
function writeCookie(key: string, value: string) {
  try {
    const encoded = encodeURIComponent(value);
    if (encoded.length + key.length > COOKIE_MAX) { clearCookie(key); return; }
    document.cookie = `${key}=${encoded}; path=/; max-age=31536000; SameSite=Lax; Secure`;
  } catch { /* cookies unavailable */ }
}
function clearCookie(key: string) {
  try { document.cookie = `${key}=; path=/; max-age=0; SameSite=Lax; Secure`; } catch { /* ignore */ }
}

const persistentStorage = {
  getItem(key: string): string | null {
    try { const v = window.localStorage.getItem(key); if (v != null) return v; } catch { /* ignore */ }
    return readCookie(key);
  },
  setItem(key: string, value: string): void {
    try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
    writeCookie(key, value);
  },
  removeItem(key: string): void {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
    clearCookie(key);
  },
};

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // (default storageKey kept, so sessions already saved stay valid)
    storage: persistentStorage,
  },
});
