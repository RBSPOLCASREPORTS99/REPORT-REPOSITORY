import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import type { Profile } from '../lib/types';

interface AuthState {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signInWithPin: (email: string, pin: string) => Promise<{ error: string | null }>;
  registerWithPin: (email: string, pin: string) => Promise<{ error: string | null }>;
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    const uid = session.user.id;
    Promise.all([
      supabase.from('profiles').select('user_id, role, full_name').eq('user_id', uid).maybeSingle(),
      supabase.from('profile_bus').select('bu_code').eq('user_id', uid),
    ]).then(([profileRes, busRes]) => {
      if (cancelled) return;
      if (!profileRes.data) { setProfile(null); return; }
      setProfile({
        user_id: profileRes.data.user_id,
        role: profileRes.data.role,
        full_name: profileRes.data.full_name,
        bus: (busRes.data ?? []).map((r) => r.bu_code as string),
      } as Profile);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user]);

  const normEmail = (e: string) => e.trim().toLowerCase();

  async function signInWithPin(email: string, pin: string) {
    const { error } = await supabase.auth.signInWithPassword({ email: normEmail(email), password: pin });
    if (!error) return { error: null };
    if (/invalid login credentials/i.test(error.message)) {
      return { error: 'Incorrect email or PIN. First time here? Tap "Set up my PIN".' };
    }
    return { error: error.message };
  }

  async function registerWithPin(email: string, pin: string) {
    const { data, error } = await supabase.auth.signUp({ email: normEmail(email), password: pin });
    if (error) {
      // A blocked (non-allowlisted) email surfaces as a generic DB error from the signup trigger.
      if (/database error|not authorized/i.test(error.message)) {
        return { error: "This email isn't authorized yet. Ask Finance to add you on the Users screen." };
      }
      if (/already registered/i.test(error.message)) {
        return { error: 'This email already has a PIN. Use "Sign in" instead.' };
      }
      return { error: error.message };
    }
    if (!data.session) {
      return { error: 'PIN set. Please confirm via the email we sent, then sign in.' };
    }
    return { error: null };
  }

  async function signInWithEmail(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: normEmail(email),
      options: { emailRedirectTo: window.location.origin },
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, profile, loading, signInWithPin, registerWithPin, signInWithEmail, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
