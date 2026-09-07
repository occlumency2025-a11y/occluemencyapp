# Occlumency — pilot web app

The app for the 13-week pilot: fifteen providers, fifty users, Bengaluru.
Six screens, seven tables, and deliberately nothing else.

React + TypeScript + Vite + Tailwind on the front, Supabase (Postgres, Auth,
row-level security) behind it. Hosted on Vercel. Runs on free tiers.

---

## What it does

| Screen | What it is for |
|---|---|
| Sign in / create account | A stable identity per user, so returning can be measured |
| Consent gate | Shown once. Writes the consent record only when the person ticks the box |
| Today | Daily mood check-in, a streak, and the last seven days |
| Find | The provider list — everyone in the pilot |
| Provider page | Full bio, fee, and the request form |
| Bookings | Pending requests and past sessions |
| You | Name, reminders, download my data, delete my account |

Matching, confirmation and payment all happen off the app — WhatsApp and UPI.
The team records completed sessions in the Supabase table editor. That is not a
shortcut; it is how you learn what the software should eventually automate.

---

## Setup

### 1. Create the Supabase project

Sign up at [supabase.com](https://supabase.com), create a project in the
Singapore or Mumbai region, and note the project URL and anon key from
**Project Settings → API**.

### 2. Apply the database

Paste each file in `supabase/migrations/` into the SQL editor in order, or:

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
```

Then, optionally, run `supabase/seed.sql` to get three example providers so the
app has something to show while you sign the real ones.

### 3. Configure auth

In **Authentication → URL Configuration**:

- Site URL: your Vercel URL (`https://occ-pilot.vercel.app`)
- Redirect URLs: add `http://localhost:5173` for local work

In **Authentication → Providers → Email**, consider turning **Confirm email**
off for the pilot. With fifty testers you will lose people to spam folders, and
the confirmation step buys you very little at this size. Turn it back on before
you open signups more widely.

### 4. Run it

```bash
cp .env.example .env.local     # fill in the two values
npm install
npm run dev                    # http://localhost:5173
```

### 5. Make yourselves staff

Sign up in the app with each team member's email, then in the Supabase table
editor open `profiles` and set `is_staff = true` for those rows. Staff can see
every booking request, edit the provider roster, and record sessions.

---

## Deploying to Vercel

1. Push this repository to GitHub.
2. In Vercel, **Add New → Project**, and import it. The framework preset is
   detected as Vite; build command `npm run build`, output directory `dist`.
3. Add both environment variables (`VITE_SUPABASE_URL`,
   `VITE_SUPABASE_ANON_KEY`) for Production, Preview and Development.
4. Deploy, then put the deployed URL into Supabase's Site URL setting.

`vercel.json` rewrites every path to `/` so client-side routes such as
`/providers/abc` work on a hard refresh.

The anon key belongs in the browser — row-level security is what protects the
data. The `service_role` key must never appear in this repository, in a `VITE_`
variable, or in Vercel's client-side environment.

---

## Running the pilot from the Supabase dashboard

**Adding a provider.** Table editor → `providers` → insert. Set `status` to
`pilot` to make them visible in the app. `contact_phone`, `notes` and
`recruited_via` stay internal — the app reads a view that does not include them.

**A booking request arrives.** Table editor → `booking_requests`, filter
`status = new`. Message the user on WhatsApp, agree a time with the provider,
then set the row to `matched`.

**After the session happens.** Insert a row in `sessions`: the user, the
provider, the date, the fee, and your commission. Set `collected = true` once
the money is actually in, and put the UPI reference in `payment_ref`. Only rows
with `collected = true` count as revenue.

**The Sunday meeting.** Open the `pilot_weekly` view. It gives you sessions
completed, money collected, active providers, repeat users, and how many people
checked in — by week. Export to CSV and paste it into the pilot report.

---

## Testing the database

The SQL checks run against any local Postgres — no Supabase account needed.
`test/00_supabase_stub.sql` stands in for `auth.users` and `auth.uid()`.

```bash
PGHOST=/tmp PGPORT=5433 ./test/run.sh
```

21 checks, covering the parts that would be expensive to get wrong:

- signup provisions a profile and settings row automatically
- a user cannot read, update or insert another user's rows
- the provider directory hides phone numbers and internal notes
- a user cannot record their own sessions, so revenue cannot be self-reported
- one check-in per person per day, enforced by the database
- the streak counts consecutive days and resets on a gap
- commission can never exceed the session fee
- deleting an account cascades everywhere and spares other users

## Smoke-testing the screens

Renders all five signed-in screens against a stubbed Supabase and fails on any
runtime error. Needs `npx playwright install chromium` once.

```bash
npm run build
npx vite preview --port 4173 &
node scripts/smoke.mjs
```

---

## Layout

```
src/
  lib/supabase.ts        the client, plus readable error messages
  lib/account.ts         auth, profile, settings, consent, export, delete
  lib/pilot.ts           providers, booking requests, sessions, check-ins
  types/database.ts      schema types — keep in step with the migrations
  context/AuthContext.tsx  session, profile, settings, consent state
  components/            AppShell (tab bar) and shared UI
  screens/               the six screens plus the consent gate
supabase/
  migrations/            0001 accounts · 0002 data rights · 0003 pilot tables
  seed.sql               three example providers
test/                    SQL behaviour checks
scripts/smoke.mjs        renders every screen and checks for runtime errors
```

---

## Deliberate choices worth knowing

**Providers do not log in.** The team manages the roster. Fifteen providers is
twenty minutes of typing, against two Saturdays building a portal nobody has
asked for. `providers` is shaped so Phase 2 can add an optional `user_id`
without a painful migration.

**No wellness score.** A score needs a method, and a method needs data you do
not have yet. Mood check-in plus streak is the whole habit loop for now. By
week thirteen there will be enough real check-ins to define a score you can
defend.

**No payments in the app.** Razorpay has no monthly fee, but forty transactions
do not justify the integration. Collect over UPI and record the reference.

**Users can read their own `sessions` rows, commission included.** The UI does
not show it, but someone reading the API directly would see it. For a pilot
that is acceptable and arguably honest. If you would rather it were hidden, add
a view over `sessions` that drops the column and point the client at that.

---

## Not in this build

In-app payments, provider logins, availability calendars, ratings and reviews,
messaging, push notifications, search and filters, an admin dashboard, courses,
a community feed, and native mobile apps.

Each of those is a Phase 2 conversation, to be had with pilot data in hand.
