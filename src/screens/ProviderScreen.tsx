import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { CATEGORY_LABELS, createBookingRequest, getProvider } from '@/lib/pilot';
import { readableError } from '@/lib/supabase';
import type { ProviderPublic } from '@/types/database';
import { ErrorNote, Spinner, formatRupees } from '@/components/ui';
import { Avatar } from './ProvidersScreen';

const SLOTS = ['Morning', 'Afternoon', 'Evening'];

/** Earliest bookable day is tomorrow — the team matches requests by hand. */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const offsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10);
}

export default function ProviderScreen() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [provider, setProvider] = useState<ProviderPublic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [day, setDay] = useState(tomorrow());
  const [slot, setSlot] = useState(SLOTS[2]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!id) return;
    getProvider(id)
      .then(setProvider)
      .catch((err) => setError(readableError(err)))
      .finally(() => setLoading(false));
  }, [id]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!user || !provider) return;
    setBusy(true);
    setError(null);
    try {
      await createBookingRequest({
        userId: user.id,
        providerId: provider.id,
        preferredDay: day,
        preferredSlot: slot,
        note,
      });
      setSent(true);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Spinner label="Loading" />;

  if (!provider) {
    return (
      <div>
        <BackLink />
        <ErrorNote>{error ?? 'That provider is not in the pilot.'}</ErrorNote>
      </div>
    );
  }

  if (sent) {
    return (
      <div>
        <BackLink />
        <div className="card mt-4 p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sage-100">
            <Check className="h-6 w-6 text-sage-700" aria-hidden="true" />
          </div>
          <h1 className="text-[22px]">Request sent</h1>
          <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-clay-500">
            Someone from the team will message you on WhatsApp within a day to confirm the time
            with {provider.name.split(' ')[0]}.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button className="btn-primary" onClick={() => navigate('/bookings')}>
              See my bookings
            </button>
            <Link to="/providers" className="btn-ghost">
              Back to the list
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackLink />

      <div className="mt-4 flex items-start gap-4">
        <Avatar name={provider.name} url={provider.photo_url} size="lg" />
        <div className="min-w-0 flex-1 pt-1">
          <h1 className="text-[24px] leading-tight">{provider.name}</h1>
          <p className="mt-1 text-[15px] text-clay-500">
            {CATEGORY_LABELS[provider.category]} · {provider.city}
          </p>
          <p className="mt-2 font-semibold text-sage-700">
            {formatRupees(provider.session_fee)}{' '}
            <span className="font-normal text-clay-400">per session</span>
          </p>
        </div>
      </div>

      {provider.headline && (
        <p className="mt-4 font-display text-lg leading-snug text-clay-700">{provider.headline}</p>
      )}

      {provider.bio && (
        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-clay-600">
          {provider.bio}
        </p>
      )}

      {provider.languages.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {provider.languages.map((l) => (
            <span key={l} className="chip bg-clay-100 text-clay-600">
              {l}
            </span>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="card mt-7 flex flex-col gap-4 p-5">
        <h2 className="text-lg">Request a session</h2>

        <div>
          <label className="label" htmlFor="day">
            Which day suits you?
          </label>
          <input
            id="day"
            type="date"
            className="field"
            value={day}
            min={tomorrow()}
            onChange={(e) => setDay(e.target.value)}
            required
          />
        </div>

        <div>
          <span className="label">Time of day</span>
          <div className="grid grid-cols-3 gap-2">
            {SLOTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlot(s)}
                aria-pressed={slot === s}
                className={[
                  'rounded-xl border px-2 py-2.5 text-sm font-semibold transition-colors',
                  slot === s
                    ? 'border-sage-500 bg-sage-50 text-sage-800'
                    : 'border-clay-200 bg-white text-clay-600 hover:border-clay-300',
                ].join(' ')}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="reqnote">
            Anything they should know? (optional)
          </label>
          <textarea
            id="reqnote"
            className="field min-h-[80px] resize-y"
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="First time seeing someone, prefer Kannada…"
          />
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Sending…' : 'Request this session'}
        </button>
        <p className="text-center text-xs leading-relaxed text-clay-400">
          Nothing is charged now. The team confirms the time with you on WhatsApp first, and you pay
          the provider directly.
        </p>
      </form>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/providers"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-clay-500 hover:text-clay-700"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      All providers
    </Link>
  );
}
