/** Shown when the Supabase environment variables are missing. */
export default function SetupNotice() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-[26px] leading-tight">Almost set up</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-clay-500">
        The app cannot reach a database yet because two environment variables are missing.
      </p>

      <div className="card mt-6 p-5">
        <h2 className="text-base">Locally</h2>
        <p className="mt-2 text-sm leading-relaxed text-clay-600">
          Copy <code className="rounded bg-clay-100 px-1.5 py-0.5">.env.example</code> to{' '}
          <code className="rounded bg-clay-100 px-1.5 py-0.5">.env.local</code>, fill in both
          values from Supabase → Project Settings → API, then restart the dev server.
        </p>

        <h2 className="mt-5 text-base">On Vercel</h2>
        <p className="mt-2 text-sm leading-relaxed text-clay-600">
          Add them under Project Settings → Environment Variables for Production, Preview and
          Development, then redeploy.
        </p>

        <pre className="mt-4 overflow-x-auto rounded-xl bg-clay-100 p-4 text-[13px] leading-relaxed text-clay-700">
          <code>
            VITE_SUPABASE_URL{'\n'}
            VITE_SUPABASE_ANON_KEY
          </code>
        </pre>
      </div>

      <p className="mt-5 text-sm leading-relaxed text-clay-400">
        The anon key is meant to be public — row-level security is what protects the data. The
        service_role key must never go in either of these.
      </p>
    </div>
  );
}
