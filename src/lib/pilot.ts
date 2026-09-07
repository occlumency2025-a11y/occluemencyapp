// Providers, booking requests, sessions and daily check-ins.

import { supabase } from './supabase';
import type {
  BookingRequest,
  Checkin,
  Mood,
  ProviderCategory,
  ProviderPublic,
  SessionRecord,
} from '@/types/database';

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

/** Today in the browser's own timezone — not UTC, which can be a day off in India. */
export function todayLocal(): string {
  const d = new Date();
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

export const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  counsellor: 'Counsellor',
  therapist: 'Therapist',
  psychiatrist: 'Psychiatrist',
  yoga: 'Yoga teacher',
  meditation: 'Meditation guide',
  coach: 'Wellness coach',
  other: 'Other',
};

export const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 'great', emoji: '😊', label: 'Great' },
  { value: 'good', emoji: '🙂', label: 'Good' },
  { value: 'okay', emoji: '😐', label: 'Okay' },
  { value: 'low', emoji: '😔', label: 'Low' },
  { value: 'stressed', emoji: '😣', label: 'Stressed' },
];

// --- providers -------------------------------------------------------------

export async function listProviders(): Promise<ProviderPublic[]> {
  return unwrap(
    await supabase.from('provider_directory').select('*').order('name', { ascending: true })
  );
}

export async function getProvider(id: string): Promise<ProviderPublic> {
  return unwrap(await supabase.from('provider_directory').select('*').eq('id', id).single());
}

// --- booking requests ------------------------------------------------------

export interface BookingRequestWithProvider extends BookingRequest {
  provider: Pick<ProviderPublic, 'id' | 'name' | 'category' | 'session_fee'> | null;
}

export async function createBookingRequest(params: {
  userId: string;
  providerId: string;
  preferredDay?: string | null;
  preferredSlot?: string | null;
  note?: string | null;
}): Promise<BookingRequest> {
  return unwrap(
    await supabase
      .from('booking_requests')
      .insert({
        user_id: params.userId,
        provider_id: params.providerId,
        preferred_day: params.preferredDay ?? null,
        preferred_slot: params.preferredSlot ?? null,
        note: params.note?.trim() || null,
      })
      .select('*')
      .single()
  );
}

export async function listMyRequests(userId: string): Promise<BookingRequestWithProvider[]> {
  return unwrap(
    await supabase
      .from('booking_requests')
      .select('*, provider:providers(id, name, category, session_fee)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
  );
}

export async function cancelRequest(id: string): Promise<void> {
  const { error } = await supabase
    .from('booking_requests')
    .update({ status: 'cancelled' })
    .eq('id', id);
  if (error) throw error;
}

// --- sessions --------------------------------------------------------------

export interface SessionWithProvider extends SessionRecord {
  provider: Pick<ProviderPublic, 'id' | 'name' | 'category'> | null;
}

export async function listMySessions(userId: string): Promise<SessionWithProvider[]> {
  return unwrap(
    await supabase
      .from('sessions')
      .select('*, provider:providers(id, name, category)')
      .eq('user_id', userId)
      .order('held_on', { ascending: false })
  );
}

// --- check-ins -------------------------------------------------------------

export async function getTodayCheckin(userId: string): Promise<Checkin | null> {
  const { data, error } = await supabase
    .from('checkins')
    .select('*')
    .eq('user_id', userId)
    .eq('on_date', todayLocal())
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Saves today's mood. Safe to call again — it updates rather than failing. */
export async function saveCheckin(
  userId: string,
  mood: Mood,
  note?: string | null
): Promise<Checkin> {
  return unwrap(
    await supabase
      .from('checkins')
      .upsert(
        { user_id: userId, on_date: todayLocal(), mood, note: note?.trim() || null },
        { onConflict: 'user_id,on_date' }
      )
      .select('*')
      .single()
  );
}

export async function listRecentCheckins(userId: string, days = 14): Promise<Checkin[]> {
  const from = new Date();
  from.setDate(from.getDate() - (days - 1));
  const fromStr = from.toISOString().slice(0, 10);

  return unwrap(
    await supabase
      .from('checkins')
      .select('*')
      .eq('user_id', userId)
      .gte('on_date', fromStr)
      .order('on_date', { ascending: false })
  );
}

export async function getStreak(): Promise<number> {
  const { data, error } = await supabase.rpc('my_streak');
  if (error) throw error;
  return (data as number) ?? 0;
}
