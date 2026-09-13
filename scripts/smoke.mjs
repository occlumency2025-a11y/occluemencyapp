// Dev-only smoke check. Renders every screen against a stubbed Supabase and
// exits non-zero on any runtime error. Not part of the app build.
//
//   npm run build && npx vite preview --port 4173 &
//   node scripts/smoke.mjs
//
// Screenshots land in /tmp/shot-<screen>.png.

import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE || 'http://localhost:4173';
const CHROME = process.env.CHROME_PATH || undefined;

const USER_ID = '11111111-1111-1111-1111-111111111111';
const now = new Date().toISOString();
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const PROFILE = {
  id: USER_ID,
  display_name: 'Aarti Menon',
  avatar_url: null,
  date_of_birth: null,
  timezone: 'Asia/Kolkata',
  locale: 'en',
  onboarding_completed_at: null,
  is_staff: false,
  created_at: now,
  updated_at: now,
};

const SETTINGS = {
  user_id: USER_ID,
  theme: 'system',
  notifications_enabled: true,
  reminder_time: null,
  daily_goal_minutes: 10,
  analytics_opt_in: false,
  created_at: now,
  updated_at: now,
};

const PROVIDERS = [
  {
    id: 'p1',
    name: 'Dr Anita Rao',
    category: 'counsellor',
    city: 'Bengaluru',
    headline: 'Anxiety, burnout and work stress',
    bio: 'Twelve years in practice. I work mostly with people in their twenties and thirties who are managing pressure at work.',
    photo_url: null,
    session_fee: 900,
    languages: ['English', 'Kannada'],
  },
  {
    id: 'p2',
    name: 'Ravi Kulkarni',
    category: 'yoga',
    city: 'Bengaluru',
    headline: 'Breath work for sleep and focus',
    bio: 'Morning sessions in Indiranagar, or online.',
    photo_url: null,
    session_fee: 600,
    languages: ['English', 'Hindi', 'Kannada'],
  },
  {
    id: 'p3',
    name: 'Meera Iyer',
    category: 'meditation',
    city: 'Bengaluru',
    headline: 'Guided practice for beginners',
    bio: 'Short sessions, no prior experience needed.',
    photo_url: null,
    session_fee: 500,
    languages: ['English', 'Tamil'],
  },
];

const REQUESTS = [
  {
    id: 'r1',
    user_id: USER_ID,
    provider_id: 'p1',
    preferred_day: daysAgo(-2),
    preferred_slot: 'Evening',
    note: 'First time seeing someone.',
    status: 'matched',
    created_at: now,
    updated_at: now,
    provider: { id: 'p1', name: 'Dr Anita Rao', category: 'counsellor', session_fee: 900 },
  },
];

const SESSIONS = [
  {
    id: 's1',
    request_id: null,
    user_id: USER_ID,
    provider_id: 'p2',
    held_on: daysAgo(9),
    fee: 600,
    commission: 120,
    collected: true,
    payment_ref: 'UPI-8841',
    notes: null,
    created_at: now,
    provider: { id: 'p2', name: 'Ravi Kulkarni', category: 'yoga' },
  },
];

const CHECKINS = [
  { id: 'c1', user_id: USER_ID, on_date: today, mood: 'good', note: null, created_at: now },
  { id: 'c2', user_id: USER_ID, on_date: daysAgo(1), mood: 'okay', note: null, created_at: now },
  { id: 'c3', user_id: USER_ID, on_date: daysAgo(2), mood: 'great', note: null, created_at: now },
  { id: 'c4', user_id: USER_ID, on_date: daysAgo(4), mood: 'stressed', note: null, created_at: now },
];

// Two of today's five tasks already done, so the screenshot shows real state
// rather than an all-empty checklist.
const PLAN_ITEMS = [
  { id: 'pl1', user_id: USER_ID, on_date: today, task: 'breathing', completed: true, completed_at: now, created_at: now },
  { id: 'pl2', user_id: USER_ID, on_date: today, task: 'walk', completed: true, completed_at: now, created_at: now },
  { id: 'pl3', user_id: USER_ID, on_date: today, task: 'water', completed: false, completed_at: null, created_at: now },
  { id: 'pl4', user_id: USER_ID, on_date: today, task: 'exercise', completed: false, completed_at: null, created_at: now },
  { id: 'pl5', user_id: USER_ID, on_date: today, task: 'reading', completed: false, completed_at: null, created_at: now },
];

function dataFor(url) {
  const table = (url.match(/\/rest\/v1\/([a-z_]+)/) ?? [])[1];
  switch (table) {
    case 'profiles':
      return [PROFILE];
    case 'user_settings':
      return [SETTINGS];
    case 'current_consents':
      return [
        { user_id: USER_ID, kind: 'terms', version: '2026-09-01', granted: true, created_at: now },
        { user_id: USER_ID, kind: 'privacy', version: '2026-09-01', granted: true, created_at: now },
      ];
    case 'provider_directory': {
      const eq = url.match(/id=eq\.([^&]+)/);
      return eq ? PROVIDERS.filter((p) => p.id === eq[1]) : PROVIDERS;
    }
    case 'booking_requests':
      return REQUESTS;
    case 'sessions':
      return SESSIONS;
    case 'checkins':
      return url.includes(`on_date=eq.${today}`)
        ? CHECKINS.filter((c) => c.on_date === today)
        : CHECKINS;
    case 'daily_plan_items':
      return PLAN_ITEMS;
    default:
      return [];
  }
}

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const page = await browser.newPage({ viewport: { width: 420, height: 900 }, deviceScaleFactor: 2 });

const problems = [];
page.on('pageerror', (e) => problems.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') problems.push(`CONSOLE ${m.text()}`);
});

await page.route('**/*.supabase.co/**', async (route) => {
  const req = route.request();
  const url = req.url();

  if (url.includes('/rest/v1/rpc/my_streak')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '3' });
  }
  if (url.includes('/rest/v1/rpc/')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  }

  const rows = dataFor(url);
  const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object');
  return route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(wantsObject ? (rows[0] ?? null) : rows),
  });
});

// Seed a session so the app opens past the auth screen.
await page.addInitScript(
  ([storageKey, userId]) => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        access_token: 'stub-access-token',
        token_type: 'bearer',
        expires_in: 360000,
        expires_at: Math.floor(Date.now() / 1000) + 360000,
        refresh_token: 'stub-refresh-token',
        user: {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'aarti@example.com',
          app_metadata: {},
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      })
    );
  },
  ['occ.auth', USER_ID]
);

const routes = [
  ['today', '/'],
  ['providers', '/providers'],
  ['provider-detail', '/providers/p1'],
  ['bookings', '/bookings'],
  ['profile', '/profile'],
];

for (const [name, path] of routes) {
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `/tmp/shot-${name}.png`, fullPage: true });
  const heading = await page
    .locator('h1')
    .first()
    .textContent()
    .catch(() => '(no heading)');
  console.log(`${path.padEnd(18)} → ${heading}`);
}

await browser.close();

const real = problems.filter(
  (p) => !p.includes('Failed to load resource') && !p.includes('net::ERR')
);
console.log('\nRuntime problems:', real.length ? `\n  ${real.join('\n  ')}` : 'none');
process.exit(real.length ? 1 : 0);
