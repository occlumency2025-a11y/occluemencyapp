import { useState } from 'react';
import { recordConsent, signOut } from '@/lib/account';
import { readableError } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { ErrorNote } from '@/components/ui';

/**
 * Shown once, after the first sign-in, before the app opens.
 * The consent row is written only when the person actually ticks the box —
 * which is what makes the trail worth having.
 */
export default function ConsentGate() {
  const { user, refresh } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    if (!user || !agreed) return;
    setBusy(true);
    setError(null);
    try {
      await recordConsent(user.id, 'terms', true);
      await recordConsent(user.id, 'privacy', true);
      await recordConsent(user.id, 'marketing', marketing);
      await refresh();
    } catch (err) {
      setError(readableError(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-[26px] leading-tight">Before you start</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-clay-500">
        This is a pilot. A small team reads the booking requests and matches you with a
        professional by hand.
      </p>

      <div className="card mt-6 p-5 text-sm leading-relaxed text-clay-600">
        <h2 className="mb-3 text-base">What we store, and what we do not</h2>
        <ul className="flex list-disc flex-col gap-2 pl-5">
          <li>Your name, email, and the timezone your device reports.</li>
          <li>Sessions you request, and the daily moods you record.</li>
          <li>
            Nothing you write is shared with anyone outside the Occlumency team, and we never
            sell it.
          </li>
          <li>
            You can download everything we hold, or delete your account entirely, from the You tab
            at any time.
          </li>
          <li>
            Occlumency is not a crisis service. If you are in danger, contact local emergency
            services or a helpline directly.
          </li>
        </ul>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-clay-700">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-clay-300 text-sage-600 focus:ring-sage-400"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            I have read the above and I agree to take part in the pilot on these terms.
          </span>
        </label>

        <label className="flex cursor-pointer items-start gap-3 text-sm text-clay-500">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-clay-300 text-sage-600 focus:ring-sage-400"
            checked={marketing}
            onChange={(e) => setMarketing(e.target.checked)}
          />
          <span>Optional — email me about new workshops and providers.</span>
        </label>
      </div>

      {error && (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <button className="btn-primary mt-6" disabled={!agreed || busy} onClick={accept}>
        {busy ? 'Saving…' : 'Agree and continue'}
      </button>

      <button
        className="mt-3 text-sm text-clay-400 hover:underline"
        onClick={() => void signOut()}
      >
        Not now — sign out
      </button>
    </div>
  );
}
