import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { readableError } from '@/lib/supabase';
import {
  MOODS,
  getStreak,
  getTodayCheckin,
  listRecentCheckins,
  saveCheckin,
  todayLocal,
} from '@/lib/pilot';
import type { Checkin, Mood } from '@/types/database';
import { ErrorNote, Spinner } from '@/components/ui';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Last 7 days, oldest first, so the strip reads left to right. */
function lastSevenDays(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const offsetMs = d.getTimezoneOffset() * 60_000;
    out.push(new Date(d.getTime() - offsetMs).toISOString().slice(0, 10));
  }
  return out;
}

export default function TodayScreen() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState<Checkin | null>(null);
  const [recent, setRecent] = useState<Checkin[]>([]);
  const [streak, setStreak] = useState(0);
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setError(null);
    try {
      const [t, r, s] = await Promise.all([
        getTodayCheckin(user.id),
        listRecentCheckins(user.id, 14),
        getStreak(),
      ]);
      setToday(t);
      setRecent(r);
      setStreak(s);
      setNote(t?.note ?? '');
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function pick(mood: Mood) {
    if (!user || saving) return;
    setSaving(true);
    setError(null);
    // Optimistic: the tap should feel instant, and one row is cheap to re-fetch.
    const previous = today;
    setToday({ ...(today ?? ({} as Checkin)), mood, on_date: todayLocal() } as Checkin);
    try {
      await saveCheckin(user.id, mood, note);
      await load();
    } catch (err) {
      setToday(previous);
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveNote() {
    if (!user || !today) return;
    setSaving(true);
    try {
      await saveCheckin(user.id, today.mood, note);
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spinner label="Loading your day" />;

  const week = lastSevenDays();
  const byDate = new Map(recent.map((c) => [c.on_date, c]));
  const firstName = profile?.display_name?.split(' ')[0] ?? 'there';

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[26px] leading-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="mt-1 text-[15px] text-clay-500">
          {today ? 'Checked in for today. Nice.' : 'Take ten seconds for yourself.'}
        </p>
      </header>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Streak */}
      <div className="card flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sage-100">
          <Flame className="h-6 w-6 text-sage-700" aria-hidden="true" />
        </div>
        <div>
          <p className="font-display text-2xl leading-none text-clay-900">
            {streak} {streak === 1 ? 'day' : 'days'}
          </p>
          <p className="mt-1 text-sm text-clay-500">
            {streak === 0
              ? 'Check in today to start a streak.'
              : streak < 3
                ? 'Keep it going.'
                : 'That is a real habit forming.'}
          </p>
        </div>
      </div>

      {/* Mood picker */}
      <section className="card p-5">
        <h2 className="text-lg">How are you feeling today?</h2>
        <div className="mt-4 grid grid-cols-5 gap-2">
          {MOODS.map((m) => {
            const active = today?.mood === m.value;
            return (
              <button
                key={m.value}
                onClick={() => void pick(m.value)}
                disabled={saving}
                aria-pressed={active}
                className={[
                  'flex flex-col items-center gap-1.5 rounded-xl border px-1 py-3 transition-colors',
                  active
                    ? 'border-sage-500 bg-sage-50'
                    : 'border-clay-200 bg-white hover:border-clay-300',
                ].join(' ')}
              >
                <span className="text-2xl leading-none" aria-hidden="true">
                  {m.emoji}
                </span>
                <span
                  className={`text-[11px] font-semibold ${active ? 'text-sage-800' : 'text-clay-500'}`}
                >
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>

        {today && (
          <div className="mt-4">
            <label className="label" htmlFor="note">
              Anything you want to note? (optional)
            </label>
            <textarea
              id="note"
              className="field min-h-[76px] resize-y"
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onBlur={() => void saveNote()}
              placeholder="Slept badly, big presentation today…"
            />
            <p className="mt-1.5 text-xs text-clay-400">
              Saved automatically. Only you can read this.
            </p>
          </div>
        )}
      </section>

      {/* Last 7 days */}
      <section>
        <h2 className="mb-3 text-lg">Your last seven days</h2>
        <ul className="flex justify-between gap-1.5">
          {week.map((date) => {
            const entry = byDate.get(date);
            const mood = entry ? MOODS.find((m) => m.value === entry.mood) : null;
            const label = new Date(`${date}T00:00:00`).toLocaleDateString('en-IN', {
              weekday: 'narrow',
            });
            return (
              <li key={date} className="flex flex-1 flex-col items-center gap-1.5">
                <div
                  title={mood ? `${label}: ${mood.label}` : `${label}: no check-in`}
                  className={[
                    'flex h-11 w-full items-center justify-center rounded-xl text-lg',
                    mood ? 'bg-sage-100' : 'border border-dashed border-clay-200 bg-white',
                  ].join(' ')}
                >
                  <span aria-hidden="true">{mood ? mood.emoji : ''}</span>
                  <span className="sr-only">{mood ? mood.label : 'No check-in'}</span>
                </div>
                <span className="text-[11px] font-semibold uppercase text-clay-400">{label}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <Link to="/providers" className="btn-ghost">
        Find someone to talk to
      </Link>
    </div>
  );
}
