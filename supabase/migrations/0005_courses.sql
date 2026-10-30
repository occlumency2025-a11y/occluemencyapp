-- Occlumency — Free Courses: a staff-curated catalog of external courses on
-- brain health, plus each user's own progress through them.
--
-- Same shape as providers: the team curates the catalog by hand in the table
-- editor; users don't submit courses. The course content itself lives
-- wherever it already does — Alison, CAFO Academy, The BCI Guys, wherever —
-- this table only ever stores a link. The pilot does not host video.
--
-- Progress is self-reported, the same honesty model as checkins and today's
-- plan: none of these platforms offer the pilot a way to pull real completion
-- data, so the user tells us when they start and finish, and the database —
-- never the client — stamps when that happened.

do $$ begin
  create type public.course_topic as enum
    ('neuroplasticity', 'bci', 'mental_wellness', 'mindfulness', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.course_status as enum ('pilot', 'paused', 'dropped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.course_progress_status as enum ('in_progress', 'completed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- courses — curated by the team, same pattern as providers.
-- ---------------------------------------------------------------------------
create table if not exists public.courses (
  id                uuid primary key default gen_random_uuid(),
  title             text not null,
  provider          text not null,
  url               text not null,
  description       text,
  topic             public.course_topic not null default 'other',
  estimated_minutes integer,
  status            public.course_status not null default 'pilot',

  -- Internal only. Never selected by the public listing query.
  notes             text,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint url_is_link  check (url ~* '^https?://'),
  constraint minutes_sane check (estimated_minutes is null or estimated_minutes between 1 and 6000)
);

create index if not exists courses_status_idx on public.courses (status, topic);

drop trigger if exists courses_set_updated_at on public.courses;
create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

-- What the app is allowed to show.
create or replace view public.course_directory as
select id, title, provider, url, description, topic, estimated_minutes
from public.courses
where status = 'pilot';

-- ---------------------------------------------------------------------------
-- course_progress — one row per user per course they have started.
-- No row yet means "not started": unlike today's plan, the app never creates
-- these rows on its own — a user chooses which courses to track by tapping
-- Start, so there is nothing to create until then.
-- ---------------------------------------------------------------------------
create table if not exists public.course_progress (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  course_id    uuid not null references public.courses (id) on delete cascade,
  status       public.course_progress_status not null default 'in_progress',
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  created_at   timestamptz not null default now(),

  unique (user_id, course_id),
  constraint completed_at_matches_status check (
    (status = 'completed'   and completed_at is not null) or
    (status = 'in_progress' and completed_at is null)
  )
);

create index if not exists course_progress_user_idx   on public.course_progress (user_id, status);
create index if not exists course_progress_course_idx on public.course_progress (course_id);

-- Keeps started_at and completed_at honest regardless of what the client
-- sends. started_at is fixed the moment a row is created and never moves
-- again. completed_at is set the moment status first becomes 'completed'
-- and held there — a later update that resends status = 'completed' cannot
-- move it, which matters: without that, a client could leave a course
-- already completed and just replay the update with an earlier timestamp.
create or replace function public.set_course_progress_timestamps()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    new.started_at = now();
  else
    new.started_at = old.started_at;
  end if;

  if new.status = 'completed' then
    if old is not null and old.status = 'completed' then
      new.completed_at = old.completed_at; -- already completed — hold the original time
    else
      new.completed_at = now();            -- first time crossing into completed
    end if;
  else
    new.completed_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists course_progress_set_timestamps on public.course_progress;
create trigger course_progress_set_timestamps
  before insert or update on public.course_progress
  for each row execute function public.set_course_progress_timestamps();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.courses         enable row level security;
alter table public.course_progress enable row level security;

-- courses: everyone signed in reads the pilot catalog; only staff write —
-- same split as providers.
drop policy if exists "courses_read_pilot" on public.courses;
create policy "courses_read_pilot" on public.courses
  for select using (status = 'pilot' or public.is_staff());

drop policy if exists "courses_staff_write" on public.courses;
create policy "courses_staff_write" on public.courses
  for all using (public.is_staff()) with check (public.is_staff());

-- course_progress: entirely the user's own to create and update; staff can
-- read everyone's, for the weekly numbers, same as daily_plan_items. No
-- delete policy — a tracked course can be reopened, not removed, the same
-- deliberate choice as today's plan.
drop policy if exists "course_progress_select" on public.course_progress;
create policy "course_progress_select" on public.course_progress
  for select using (auth.uid() = user_id or public.is_staff());

drop policy if exists "course_progress_insert_own" on public.course_progress;
create policy "course_progress_insert_own" on public.course_progress
  for insert with check (auth.uid() = user_id);

drop policy if exists "course_progress_update_own" on public.course_progress;
create policy "course_progress_update_own" on public.course_progress
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Views inherit the caller's rights, so the policies above apply through them.
alter view public.course_directory set (security_invoker = on);

grant select                         on public.course_directory to authenticated;
grant select, insert, update, delete on public.courses          to authenticated;
grant select, insert, update         on public.course_progress  to authenticated;

-- ---------------------------------------------------------------------------
-- Extend the data export to cover the new table.
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
                          from public.checkins k where k.user_id = uid), '[]'::jsonb),
    'daily_plan_items', coalesce((select jsonb_agg(to_jsonb(d) - 'user_id' order by d.on_date, d.task)
                          from public.daily_plan_items d where d.user_id = uid), '[]'::jsonb),
    'course_progress', coalesce((select jsonb_agg(to_jsonb(g) - 'user_id' order by g.started_at)
                          from public.course_progress g where g.user_id = uid), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;

-- ---------------------------------------------------------------------------
-- Add course completions to the weekly numbers, alongside everything else.
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
     where c.on_date >= w.week_start and c.on_date < w.week_start + 7)                 as users_checking_in,
  (select count(distinct d.user_id) from public.daily_plan_items d
     where d.completed and d.on_date >= w.week_start and d.on_date < w.week_start + 7) as users_completing_plan,
  (select count(distinct g.user_id) from public.course_progress g
     where g.status = 'completed'
       and g.completed_at >= w.week_start and g.completed_at < w.week_start + 7)       as users_completing_courses
from weeks w
order by w.week_start;

alter view public.pilot_weekly set (security_invoker = on);
grant select on public.pilot_weekly to authenticated;
