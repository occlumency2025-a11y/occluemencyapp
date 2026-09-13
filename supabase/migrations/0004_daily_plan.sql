-- Occlumency — Today's Plan: five fixed daily tasks, checked off by the user.
--
-- Same shape as checkins: rows for "today" don't exist until the app creates
-- them on first visit, and a new day means a new, unchecked set. The task
-- list itself is fixed for the pilot — see PLAN_TASKS in src/lib/pilot.ts —
-- so there is no template table to manage yet.

do $$ begin
  create type public.plan_task as enum (
    'breathing', 'walk', 'water', 'exercise', 'reading'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.daily_plan_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  on_date      date not null default current_date,
  task         public.plan_task not null,
  completed    boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),

  unique (user_id, on_date, task),
  constraint completed_at_matches_completed check (
    (completed and completed_at is not null) or (not completed and completed_at is null)
  )
);

create index if not exists daily_plan_items_user_date_idx
  on public.daily_plan_items (user_id, on_date desc);

-- Keeps completed_at honest regardless of what the client sends.
create or replace function public.set_plan_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.completed and (old is null or not old.completed) then
    new.completed_at = now();
  elsif not new.completed then
    new.completed_at = null;
  end if;
  return new;
end;
$$;

drop trigger if exists daily_plan_items_set_completed_at on public.daily_plan_items;
create trigger daily_plan_items_set_completed_at
  before insert or update on public.daily_plan_items
  for each row execute function public.set_plan_completed_at();

-- Row-level security: users manage their own rows; staff can read (for the
-- weekly numbers below) but never write someone else's plan.
alter table public.daily_plan_items enable row level security;

drop policy if exists "plan_items_select" on public.daily_plan_items;
create policy "plan_items_select" on public.daily_plan_items
  for select using (auth.uid() = user_id or public.is_staff());

drop policy if exists "plan_items_insert_own" on public.daily_plan_items;
create policy "plan_items_insert_own" on public.daily_plan_items
  for insert with check (auth.uid() = user_id);

drop policy if exists "plan_items_update_own" on public.daily_plan_items;
create policy "plan_items_update_own" on public.daily_plan_items
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.daily_plan_items to authenticated;

-- Extend the data export to cover the new table.
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
                          from public.daily_plan_items d where d.user_id = uid), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;

-- Add plan completion to the weekly numbers, alongside sessions and check-ins.
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
     where d.completed and d.on_date >= w.week_start and d.on_date < w.week_start + 7) as users_completing_plan
from weeks w
order by w.week_start;

alter view public.pilot_weekly set (security_invoker = on);
grant select on public.pilot_weekly to authenticated;
