import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * False when the environment variables are missing. The app shows a setup
 * screen rather than throwing at import time, which would leave a blank page
 * and only a console message.
 */
export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient<Database>(url ?? 'http://unconfigured.local', anonKey ?? 'unconfigured', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'occ.auth',
  },
});

/** Turns a Supabase / Postgres error into something a person can act on. */
export function readableError(err: unknown): string {
  if (!err) return 'Something went wrong.';
  const e = err as { message?: string; code?: string };
  const msg = e.message ?? String(err);

  if (e.code === '23505' || msg.includes('duplicate key')) {
    return 'That has already been recorded.';
  }
  if (msg.includes('Invalid login credentials')) {
    return 'That email and password do not match an account.';
  }
  if (msg.includes('User already registered')) {
    return 'An account already exists for this email. Try signing in.';
  }
  if (msg.includes('Email not confirmed')) {
    return 'Check your email and confirm the address before signing in.';
  }
  if (msg.toLowerCase().includes('password')) {
    return 'Password must be at least 8 characters.';
  }
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Cannot reach the server. Check your connection and try again.';
  }
  return msg;
}
