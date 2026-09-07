import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { getCurrentConsents, getProfile, getSettings, hasRequiredConsent } from '@/lib/account';
import type { ConsentKind, Profile, UserSettings } from '@/types/database';

interface AuthState {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  settings: UserSettings | null;
  consents: Partial<Record<ConsentKind, boolean>>;
  consentGiven: boolean;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [consents, setConsents] = useState<Partial<Record<ConsentKind, boolean>>>({});

  const userId = session?.user?.id ?? null;

  const load = useCallback(async (id: string | null) => {
    if (!id) {
      setProfile(null);
      setSettings(null);
      setConsents({});
      return;
    }
    try {
      const [p, s, c] = await Promise.all([getProfile(id), getSettings(id), getCurrentConsents(id)]);
      setProfile(p);
      setSettings(s);
      setConsents(c);
    } catch (err) {
      // A brand-new signup can land here a beat before the trigger commits.
      // One short retry covers that without a spinner loop.
      await new Promise((r) => setTimeout(r, 700));
      try {
        const [p, s, c] = await Promise.all([
          getProfile(id),
          getSettings(id),
          getCurrentConsents(id),
        ]);
        setProfile(p);
        setSettings(s);
        setConsents(c);
      } catch (retryErr) {
        console.warn('[auth] profile not available yet', retryErr, err);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await load(data.session?.user?.id ?? null);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!active) return;
      setSession(next);
      await load(next?.user?.id ?? null);
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [load]);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      settings,
      consents,
      consentGiven: hasRequiredConsent(consents),
      refresh: () => load(userId),
    }),
    [loading, session, profile, settings, consents, userId, load]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
