import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import {
  CATEGORY_LABELS,
  cancelRequest,
  listMyRequests,
  listMySessions,
  type BookingRequestWithProvider,
  type SessionWithProvider,
} from '@/lib/pilot';
import { readableError } from '@/lib/supabase';
import {
  EmptyState,
  ErrorNote,
  PageHeader,
  Spinner,
  StatusChip,
  formatDate,
  formatRupees,
} from '@/components/ui';

export default function BookingsScreen() {
  const { user } = useAuth();
  const [requests, setRequests] = useState<BookingRequestWithProvider[]>([]);
  const [sessions, setSessions] = useState<SessionWithProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [r, s] = await Promise.all([listMyRequests(user.id), listMySessions(user.id)]);
      setRequests(r);
      setSessions(s);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cancel(id: string) {
    setError(null);
    try {
      await cancelRequest(id);
      await load();
    } catch (err) {
      setError(readableError(err));
    }
  }

  if (loading) return <Spinner label="Loading your bookings" />;

  const open = requests.filter((r) => r.status === 'new' || r.status === 'matched');
  const closed = requests.filter((r) => r.status === 'cancelled' || r.status === 'no_show');

  return (
    <div>
      <PageHeader title="Your bookings" />

      {error && (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      {open.length === 0 && sessions.length === 0 && closed.length === 0 && (
        <EmptyState
          title="Nothing booked yet"
          body="When you request a session it shows up here, and the team confirms the time with you on WhatsApp."
          action={
            <Link to="/providers" className="btn-primary">
              Find someone
            </Link>
          }
        />
      )}

      {open.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg">Coming up</h2>
          <ul className="flex flex-col gap-3">
            {open.map((r) => (
              <li key={r.id} className="card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-clay-900">
                      {r.provider?.name ?? 'Provider'}
                    </p>
                    <p className="text-sm text-clay-500">
                      {r.provider ? CATEGORY_LABELS[r.provider.category] : '—'}
                    </p>
                  </div>
                  <StatusChip status={r.status} />
                </div>

                <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  <div className="flex gap-1.5">
                    <dt className="text-clay-400">Preferred</dt>
                    <dd className="font-medium text-clay-700">
                      {formatDate(r.preferred_day)}
                      {r.preferred_slot ? `, ${r.preferred_slot.toLowerCase()}` : ''}
                    </dd>
                  </div>
                  {r.provider && (
                    <div className="flex gap-1.5">
                      <dt className="text-clay-400">Fee</dt>
                      <dd className="font-medium text-clay-700">
                        {formatRupees(r.provider.session_fee)}
                      </dd>
                    </div>
                  )}
                </dl>

                {r.note && <p className="mt-3 text-sm italic text-clay-500">“{r.note}”</p>}

                <button
                  onClick={() => void cancel(r.id)}
                  className="mt-4 text-sm font-semibold text-clay-400 hover:text-red-700 hover:underline"
                >
                  Cancel this request
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {sessions.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-lg">Past sessions</h2>
          <ul className="flex flex-col gap-3">
            {sessions.map((s) => (
              <li key={s.id} className="card flex items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-clay-900">
                    {s.provider?.name ?? 'Provider'}
                  </p>
                  <p className="text-sm text-clay-500">{formatDate(s.held_on)}</p>
                </div>
                <p className="shrink-0 font-semibold text-clay-700">{formatRupees(s.fee)}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-clay-400">
            Booked with someone before? You can request them again in one tap from their page.
          </p>
        </section>
      )}

      {closed.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg">Closed requests</h2>
          <ul className="flex flex-col gap-2">
            {closed.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-clay-100 bg-white px-4 py-3"
              >
                <span className="truncate text-sm text-clay-500">
                  {r.provider?.name ?? 'Provider'} · {formatDate(r.preferred_day)}
                </span>
                <StatusChip status={r.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
