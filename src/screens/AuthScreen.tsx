import { useState, type FormEvent } from 'react';
import { requestPasswordReset, signIn, signUp } from '@/lib/account';
import { readableError } from '@/lib/supabase';
import { ErrorNote } from '@/components/ui';

type Mode = 'signin' | 'signup' | 'reset';

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        // AuthProvider picks the session up and swaps the screen.
      } else if (mode === 'signup') {
        const result = await signUp({ email, password, displayName });
        if (!result.session) {
          setNotice('Almost there — check your email and confirm the address, then sign in.');
          setMode('signin');
        }
      } else {
        await requestPasswordReset(email);
        setNotice('If that address has an account, a reset link is on its way.');
        setMode('signin');
      }
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="mb-8">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-sage-600 font-display text-2xl text-white">
          O
        </div>
        <h1 className="text-[30px] leading-tight">
          {mode === 'signup'
            ? 'Create your account'
            : mode === 'reset'
              ? 'Reset your password'
              : 'Welcome back'}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-clay-500">
          {mode === 'signup'
            ? 'Occlumency helps you find a wellness professional and check in on how you are doing.'
            : mode === 'reset'
              ? 'Enter your email and we will send you a link to set a new password.'
              : 'Sign in to book a session and keep your check-in streak going.'}
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === 'signup' && (
          <div>
            <label className="label" htmlFor="name">
              Your name
            </label>
            <input
              id="name"
              className="field"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should we greet you?"
              autoComplete="name"
              maxLength={60}
            />
          </div>
        )}

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        {mode !== 'reset' && (
          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
        {notice && (
          <p className="rounded-xl bg-sage-50 px-4 py-3 text-sm text-sage-800">{notice}</p>
        )}

        <button type="submit" className="btn-primary mt-1" disabled={busy}>
          {busy
            ? 'Working…'
            : mode === 'signup'
              ? 'Create account'
              : mode === 'reset'
                ? 'Send reset link'
                : 'Sign in'}
        </button>
      </form>

      <div className="mt-6 flex flex-col gap-2 text-center text-sm text-clay-500">
        {mode === 'signin' && (
          <>
            <button
              type="button"
              className="font-semibold text-sage-700 hover:underline"
              onClick={() => {
                setMode('signup');
                setError(null);
              }}
            >
              New here? Create an account
            </button>
            <button
              type="button"
              className="hover:underline"
              onClick={() => {
                setMode('reset');
                setError(null);
              }}
            >
              Forgot your password?
            </button>
          </>
        )}
        {mode !== 'signin' && (
          <button
            type="button"
            className="font-semibold text-sage-700 hover:underline"
            onClick={() => {
              setMode('signin');
              setError(null);
            }}
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
