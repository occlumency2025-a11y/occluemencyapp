// Account, profile, settings and consent. The screens call these, never supabase directly.

import { supabase } from './supabase';
import type {
  ConsentKind,
  Profile,
  ProfileUpdate,
  SettingsUpdate,
  UserSettings,
} from '@/types/database';

/** Bump when the wording of the terms or privacy policy changes. */
export const CONSENT_VERSIONS: Record<ConsentKind, string> = {
  terms: '2026-09-01',
  privacy: '2026-09-01',
  marketing: '2026-09-01',
};

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

// --- auth ------------------------------------------------------------------

export async function signUp(params: { email: string; password: string; displayName?: string }) {
  const { data, error } = await supabase.auth.signUp({
    email: params.email.trim().toLowerCase(),
    password: params.password,
    options: {
      data: {
        display_name: params.displayName?.trim() || null,
        timezone: browserTimezone(),
      },
      emailRedirectTo: `${window.location.origin}/`,
    },
  });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/`,
  });
  if (error) throw error;
}

// --- profile + settings ----------------------------------------------------

export async function getProfile(userId: string): Promise<Profile> {
  return unwrap(await supabase.from('profiles').select('*').eq('id', userId).single());
}

export async function updateProfile(userId: string, patch: ProfileUpdate): Promise<Profile> {
  return unwrap(
    await supabase.from('profiles').update(patch).eq('id', userId).select('*').single()
  );
}

export async function getSettings(userId: string): Promise<UserSettings> {
  return unwrap(
    await supabase.from('user_settings').select('*').eq('user_id', userId).single()
  );
}

export async function updateSettings(
  userId: string,
  patch: SettingsUpdate
): Promise<UserSettings> {
  return unwrap(
    await supabase.from('user_settings').update(patch).eq('user_id', userId).select('*').single()
  );
}

// --- consent ---------------------------------------------------------------

export async function recordConsent(userId: string, kind: ConsentKind, granted: boolean) {
  const { error } = await supabase.from('consents').insert({
    user_id: userId,
    kind,
    version: CONSENT_VERSIONS[kind],
    granted,
  });
  if (error) throw error;
}

/** Latest answer per consent kind, e.g. { terms: true, marketing: false }. */
export async function getCurrentConsents(
  userId: string
): Promise<Partial<Record<ConsentKind, boolean>>> {
  const rows = unwrap(
    await supabase
      .from('current_consents')
      .select('kind, granted, version')
      .eq('user_id', userId)
  );
  return Object.fromEntries((rows ?? []).map((r) => [r.kind, r.granted]));
}

/** True when the user has actively agreed to the current terms and privacy wording. */
export function hasRequiredConsent(consents: Partial<Record<ConsentKind, boolean>>): boolean {
  return consents.terms === true && consents.privacy === true;
}

// --- data rights -----------------------------------------------------------

export async function exportMyData(): Promise<unknown> {
  const { data, error } = await supabase.rpc('export_my_data');
  if (error) throw error;
  return data;
}

/** Downloads the user's full record as a JSON file. */
export async function downloadMyData() {
  const data = await exportMyData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `occlumency-data-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Irreversible. Deletes the account and signs the user out. */
export async function deleteMyAccount() {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw error;
  await supabase.auth.signOut();
}
