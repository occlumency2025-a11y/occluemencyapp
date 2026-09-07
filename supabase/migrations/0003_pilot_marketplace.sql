-- Occlumency — Modules 2–5: everything the 13-week pilot needs, and nothing more.
--
-- Deliberately absent: payments, availability calendars, ratings, reviews,
-- messaging, search. All of those are handled by hand or by WhatsApp during
-- the pilot. Add them in Phase 2, from evidence, not from the pitch deck.

-- ---------------------------------------------------------------------------
-- Staff flag — the team manages providers and records sessions.
-- Set it by hand in the Supabase table editor for the six of you.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_staff boolean not null default false;

comment on column public.profiles.is_staff is
  'Team members. Grants write access to providers, sessions and all bookings.';

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_staff from public.profiles p where p.id = auth.uid()), false);
$$;

grant execute on function public.is_staff() to authenticated;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.provider_category as enum
    ('counsellor', 'therapist', 'psychiatrist', 'yoga', 'meditation', 'coach', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.provider_status as enum ('pilot', 'paused', 'dropped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum ('new', 'matched', 'completed', 'cancelled', 'no_show');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.mood as enum ('great', 'good', 'okay', 'low', 'stressed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- providers — managed by the team; providers do not log in during the pilot
-- ---------------------------------------------------------------------------
create table if not exists public.providers (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       public.provider_category not null,
  city           text not null default 'Bengaluru',
  headline       text,
  bio            text,
  photo_url      text,
  session_fee    integer not null,
  languages      text[] not null default '{}',
  status         public.provider_status not null default 'pilot',

  -- Internal only. Never selected by the public listing query.
  contact_phone  text,
  contact_email  text,
  recruited_via  text,
  signed_on      date,
  notes          text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  constraint fee_sane check (session_fee between 0 and 20000)
);

create index if not exists providers_status_idx on public.providers (status, category);

drop trigger if exists providers_set_updated_at on public.providers;
create trigger providers_set_updated_at
  before update on public.providers
  for each row execute function public.set_updated_at();

-- What the app is allowed to show. Keeps phone numbers off the client.
create or replace view public.provider_directory as
select id, name, category, city, headline, bio, photo_url, session_fee, languages
from public.providers
where status = 'pilot';

-- ---------------------------------------------------------------------------
-- booking_requests — a user asks; the team matches by hand over WhatsApp
-- ---------------------------------------------------------------------------
create table if not exists public.booking_requests (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  provider_id   uuid references public.providers (id) on delete set null,
  preferred_day date,
  preferred_slot text,
  note          text,
  status        public.request_status not null default 'new',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint note_length check (note is null or char_length(note) <= 1000)
);

create index if not exists booking_requests_user_idx   on public.booking_requests (user_id, created_at desc);
create index if not exists booking_requests_status_idx on public.booking_requests (status, created_at desc);

drop trigger if exists booking_requests_set_updated_at on public.booking_requests;
create trigger booking_requests_set_updated_at
  before update on public.booking_requests
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sessions — what actually happened, and what you were paid.
-- This table IS the pilot report. Money is collected over UPI outside the app;
-- these rows are the record of it.
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid references public.booking_requests (id) on delete set null,
  user_id       uuid not null references public.profiles (id) on delete cascade,
  provider_id   uuid not null references public.providers (id) on delete restrict,
  held_on       date not null,
  fee           integer not null,
  commission    integer not null,
  collected     boolean not null default false,
  payment_ref   text,
  notes         text,
  created_at    timestamptz not null default now(),

  constraint fee_positive        check (fee >= 0),
  constraint commission_in_range check (commission >= 0 and commission <= fee)
);

create index if not exists sessions_held_idx     on public.sessions (held_on desc);
create index if not exists sessions_user_idx     on public.sessions (user_id, held_on desc);
create index if not exists sessions_provider_idx on public.sessions (provider_id, held_on desc);

-- ---------------------------------------------------------------------------
-- checkins — the whole habit loop for the pilot: one mood a day, and a streak.
-- No wellness score yet. A score invented before you have check-ins to define
-- it is a number nobody can defend.
-- ---------------------------------------------------------------------------
create table if not exists public.checkins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  on_date    date not null default current_date,
  mood       public.mood not null,
  note       text,
  created_at timestamptz not null default now(),

  unique (user_id, on_date),
  constraint note_length check (note is null or char_length(note) <= 500)
);

create index if not exists checkins_user_idx on public.checkins (user_id, on_date desc);

-- Current streak in days, for the calling user.
create or replace function public.my_streak()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with days as (
    -- Gaps and islands: ordering newest first, adding the row number back to
    -- the date gives every run of consecutive days the same key.
    select on_date,
           on_date + (row_number() over (order by on_date desc))::integer * interval '1 day' as grp
    from public.checkins
    where user_id = auth.uid()
      and on_date <= current_date
  ),
  latest as (
    select grp, count(*) as len, max(on_date) as last_day
    from days group by grp order by max(on_date) desc limit 1
  )
  select coalesce((select len from latest where last_day >= current_date - 1), 0)::integer;
$$;

grant execute on function public.my_streak() to authenticated;

comment on function public.my_streak() is
  'Consecutive check-in days ending today or yesterday. Returns 0 once the streak breaks.';

-- ---------------------------------------------------------------------------
-- pilot_weekly — the four numbers, computed instead of hand-counted.
-- Staff only. Export this to CSV for the pilot report.
-- ---------------------------------------------------------------------------
create or replace view public.pilot_weekly as
with weeks as (
  select generate_series(
           date_trunc('week', date '2026-09-07'),
           date_trunc('week', current_date),
           interval '1 week'
         )::date as week_start
)
select
  w.week_start,
  (select count(*) from public.sessions s
     where s.held_on >= w.week_start and s.held_on < w.week_start + 7)                 as sessions_completed,
  (select coalesce(sum(s.commission), 0) from public.sessions s
     where s.collected and s.held_on >= w.week_start and s.held_on < w.week_start + 7) as money_collected,
  (select count(distinct s.provider_id) from public.sessions s
     where s.held_on >= w.week_start and s.held_on < w.week_start + 7)                 as active_providers,
  (select count(*) from (
     select s.user_id from public.sessions s
      where s.held_on < w.week_start + 7
      group by s.user_id having count(*) > 1) r)                                       as repeat_users,
  (select count(distinct c.user_id) from public.checkins c
     where c.on_date >= w.week_start and c.on_date < w.week_start + 7)                 as users_checking_in
from weeks w
order by w.week_start;

comment on view public.pilot_weekly is
  'The four numbers from the Sunday meeting, plus check-in reach. Staff only.';

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.providers        enable row level security;
alter table public.booking_requests enable row level security;
alter table public.sessions         enable row level security;
alter table public.checkins         enable row level security;

-- providers: everyone signed in reads the pilot roster; only staff write.
drop policy if exists "providers_read_pilot" on public.providers;
create policy "providers_read_pilot" on public.providers
  for select using (status = 'pilot' or public.is_staff());

drop policy if exists "providers_staff_write" on public.providers;
create policy "providers_staff_write" on public.providers
  for all using (public.is_staff()) with check (public.is_staff());

-- booking_requests: users own theirs; staff see and update everything.
drop policy if exists "requests_select" on public.booking_requests;
create policy "requests_select" on public.booking_requests
  for select using (auth.uid() = user_id or public.is_staff());

drop policy if exists "requests_insert_own" on public.booking_requests;
create policy "requests_insert_own" on public.booking_requests
  for insert with check (auth.uid() = user_id);

drop policy if exists "requests_staff_update" on public.booking_requests;
create policy "requests_staff_update" on public.booking_requests
  for update using (public.is_staff()) with check (public.is_staff());

-- sessions: users read their own history; only staff record them.
drop policy if exists "sessions_select" on public.sessions;
create policy "sessions_select" on public.sessions
  for select using (auth.uid() = user_id or public.is_staff());

drop policy if exists "sessions_staff_write" on public.sessions;
create policy "sessions_staff_write" on public.sessions
  for all using (public.is_staff()) with check (public.is_staff());

-- checkins: entirely the user's own.
drop policy if exists "checkins_own" on public.checkins;
create policy "checkins_own" on public.checkins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Views inherit the caller's rights, so the policies above apply through them.
alter view public.provider_directory set (security_invoker = on);
alter view public.pilot_weekly       set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select                         on public.provider_directory to authenticated;
grant select, insert, update, delete on public.providers          to authenticated;
grant select, insert, update         on public.booking_requests   to authenticated;
grant select, insert, update, delete on public.sessions           to authenticated;
grant select, insert, update, delete on public.checkins           to authenticated;
grant select                         on public.pilot_weekly       to authenticated;

-- ---------------------------------------------------------------------------
-- Extend the data export so it still covers everything we hold
-- ---------------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select jsonb_build_object(
    'exported_at', now(),
    'account', (
      select jsonb_build_object('id', u.id, 'email', u.email,
                                'created_at', u.created_at,
                                'last_sign_in_at', u.last_sign_in_at)
      from auth.users u where u.id = uid
    ),
    'profile',  (select to_jsonb(p) - 'id'      from public.profiles p      where p.id = uid),
    'settings', (select to_jsonb(s) - 'user_id' from public.user_settings s where s.user_id = uid),
    'consents', coalesce((select jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at)
                          from public.consents c where c.user_id = uid), '[]'::jsonb),
    'booking_requests', coalesce((select jsonb_agg(to_jsonb(b) - 'user_id' order by b.created_at)
                          from public.booking_requests b where b.user_id = uid), '[]'::jsonb),
    'sessions', coalesce((select jsonb_agg(to_jsonb(x) - 'user_id' order by x.held_on)
                          from public.sessions x where x.user_id = uid), '[]'::jsonb),
    'checkins', coalesce((select jsonb_agg(to_jsonb(k) - 'user_id' order by k.on_date)
                          from public.checkins k where k.user_id = uid), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;
