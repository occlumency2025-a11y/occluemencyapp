// Providers, booking requests, sessions, daily check-ins and today's plan.

import { supabase } from './supabase';
import type {
  BookingRequest,
  Checkin,
  DailyPlanItem,
  Mood,
  PlanTask,
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

// --- today's plan ------------------------------------------------------
//
// Five fixed tasks, chosen by the team rather than the user, same as the
// original wellness-app mock ("2/4 done"). Rows for today are created lazily
// on first visit — see ensureTodayPlan — and a new day means a fresh,
// unchecked set, the same pattern as checkins.

export const PLAN_TASKS: { task: PlanTask; label: string; minutes: number | null }[] = [
  { task: 'breathing', label: 'Breathing exercise', minutes: 5 },
  { task: 'walk', label: '20-minute walk', minutes: 20 },
  { task: 'water', label: 'Drink 6 glasses of water', minutes: null },
  { task: 'exercise', label: '10-minute physical exercise', minutes: 10 },
  { task: 'reading', label: '30-minute book reading', minutes: 30 },
];

/**
 * Creates today's five rows the first time they're needed and returns all of
 * today's plan items. Safe to call on every visit — existing rows are left
 * untouched, so a task already checked off stays checked off.
 */
export async function ensureTodayPlan(userId: string): Promise<DailyPlanItem[]> {
  const { error: insertError } = await supabase
    .from('daily_plan_items')
    .upsert(
      PLAN_TASKS.map(({ task }) => ({ user_id: userId, task, on_date: todayLocal() })),
      { onConflict: 'user_id,on_date,task', ignoreDuplicates: true }
    );
  if (insertError) throw insertError;

  return unwrap(
    await supabase
      .from('daily_plan_items')
      .select('*')
      .eq('user_id', userId)
      .eq('on_date', todayLocal())
  );
}

/** Flips one task on or off. completed_at is set by a database trigger. */
export async function setPlanItemCompleted(
  id: string,
  completed: boolean
): Promise<DailyPlanItem> {
  return unwrap(
    await supabase.from('daily_plan_items').update({ completed }).eq('id', id).select('*').single()
  );
}
