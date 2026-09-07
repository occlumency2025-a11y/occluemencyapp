import { useEffect, useState } from 'react';
import { Download, LogOut, Trash2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  deleteMyAccount,
  downloadMyData,
  signOut,
  updateProfile,
  updateSettings,
} from '@/lib/account';
import { readableError } from '@/lib/supabase';
import { ErrorNote, PageHeader, Spinner } from '@/components/ui';

export default function ProfileScreen() {
  const { user, profile, settings, loading, refresh } = useAuth();

  const [name, setName] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [busy, setBusy] = useState<null | 'export' | 'delete'>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setName(profile?.display_name ?? '');
  }, [profile?.display_name]);

  if (loading) return <Spinner />;

  async function saveName() {
    if (!user || name.trim() === (profile?.display_name ?? '')) return;
    setSavingName(true);
    setError(null);
    try {
      await updateProfile(user.id, { display_name: name.trim() || null });
      await refresh();
      setNameSaved(true);
      setTimeout(() => setNameSaved(false), 2000);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSavingName(false);
    }
  }

  async function toggleNotifications(next: boolean) {
    if (!user) return;
    setError(null);
    try {
      await updateSettings(user.id, { notifications_enabled: next });
      await refresh();
    } catch (err) {
      setError(readableError(err));
    }
  }

  async function onExport() {
    setBusy('export');
    setError(null);
    try {
      await downloadMyData();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    setBusy('delete');
    setError(null);
    try {
      await deleteMyAccount();
      window.location.replace('/');
    } catch (err) {
      setError(readableError(err));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <PageHeader title="You" subtitle={user?.email ?? undefined} />

      {error && <ErrorNote>{error}</ErrorNote>}

      <section className="card p-5">
        <label className="label" htmlFor="displayName">
          Your name
        </label>
        <input
          id="displayName"
          className="field"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveName()}
        />
        <p className="mt-1.5 text-xs text-clay-400">
          {savingName ? 'Saving…' : nameSaved ? 'Saved.' : 'Saved when you tap outside the box.'}
        </p>

        <dl className="mt-5 flex flex-col gap-2 border-t border-clay-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-clay-400">Timezone</dt>
            <dd className="font-medium text-clay-700">{profile?.timezone ?? '—'}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-clay-400">Joined</dt>
            <dd className="font-medium text-clay-700">
              {profile?.created_at
                ? new Date(profile.created_at).toLocaleDateString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—'}
            </dd>
          </div>
        </dl>
      </section>

      <section className="card p-5">
        <h2 className="text-lg">Reminders</h2>
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-4">
          <span className="text-sm text-clay-600">
            Let the team message me about my bookings and check-ins
          </span>
          <input
            type="checkbox"
            className="h-6 w-6 shrink-0 rounded border-clay-300 text-sage-600 focus:ring-sage-400"
            checked={settings?.notifications_enabled ?? true}
            onChange={(e) => void toggleNotifications(e.target.checked)}
          />
        </label>
        <p className="mt-2 text-xs leading-relaxed text-clay-400">
          During the pilot these come from a person on WhatsApp, not from an automated system.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="text-lg">Your data</h2>
        <p className="mt-2 text-sm leading-relaxed text-clay-500">
          You can take a copy of everything we hold about you, or remove it entirely. Deleting is
          immediate and cannot be undone.
        </p>

        <button onClick={() => void onExport()} className="btn-ghost mt-4 w-full" disabled={busy !== null}>
          <Download className="h-4 w-4" aria-hidden="true" />
          {busy === 'export' ? 'Preparing…' : 'Download my data'}
        </button>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="btn-danger mt-3 w-full"
            disabled={busy !== null}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Delete my account
          </button>
        ) : (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm font-semibold text-red-900">
              This deletes your profile, bookings and check-ins permanently.
            </p>
            <label className="label mt-3 text-red-900" htmlFor="confirm">
              Type DELETE to confirm
            </label>
            <input
              id="confirm"
              className="field border-red-200"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              autoComplete="off"
            />
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => void onDelete()}
                disabled={confirmText !== 'DELETE' || busy !== null}
                className="btn flex-1 bg-red-700 text-white hover:bg-red-800"
              >
                {busy === 'delete' ? 'Deleting…' : 'Delete permanently'}
              </button>
              <button
                onClick={() => {
                  setConfirming(false);
                  setConfirmText('');
                }}
                className="btn-ghost flex-1"
              >
                Keep my account
              </button>
            </div>
          </div>
        )}
      </section>

      <button onClick={() => void signOut()} className="btn-ghost">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        Sign out
      </button>

      <p className="pb-4 text-center text-xs leading-relaxed text-clay-400">
        Occlumency is a pilot, not a crisis service. If you are in immediate danger, please contact
        local emergency services or a helpline directly.
      </p>
    </div>
  );
}
