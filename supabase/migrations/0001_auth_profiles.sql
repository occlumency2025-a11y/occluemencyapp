-- Occlumency — Module 1: auth + user profiles
-- Runs on top of Supabase's built-in auth.users table.
-- Apply with: supabase db push   (or paste into the SQL editor)

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.theme_pref as enum ('system', 'light', 'dark');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.consent_kind as enum ('terms', 'privacy', 'marketing');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at honest
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per user, created automatically on sign-up
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  display_name           text,
  avatar_url             text,
  date_of_birth          date,
  timezone               text not null default 'Asia/Kolkata',
  locale                 text not null default 'en',
  onboarding_completed_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint display_name_length check (display_name is null or char_length(display_name) between 1 and 60),
  constraint dob_sane check (date_of_birth is null or date_of_birth between '1900-01-01' and current_date)
);

comment on table public.profiles is 'Public-facing user profile. One row per auth.users row.';
comment on column public.profiles.date_of_birth is 'Optional. Used only for age-normed brain-health scoring.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_settings — app preferences, one row per user
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  theme                 public.theme_pref not null default 'system',
  notifications_enabled boolean not null default true,
  reminder_time         time,
  daily_goal_minutes    integer not null default 10,
  analytics_opt_in      boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint daily_goal_range check (daily_goal_minutes between 1 and 480)
);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at
  before update on public.user_settings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- consents — append-only record of what each user agreed to, and when
-- ---------------------------------------------------------------------------
create table if not exists public.consents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       public.consent_kind not null,
  version    text not null,
  granted    boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists consents_user_kind_idx
  on public.consents (user_id, kind, created_at desc);

comment on table public.consents is 'Append-only. To withdraw consent, insert a new row with granted = false.';

-- Latest state per (user, kind) — what the app should read.
create or replace view public.current_consents as
select distinct on (user_id, kind)
  user_id, kind, version, granted, created_at
from public.consents
order by user_id, kind, created_at desc;

-- ---------------------------------------------------------------------------
-- Auto-provision profile + settings on sign-up
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, timezone, locale)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name',
                         new.raw_user_meta_data ->> 'full_name',
                         new.raw_user_meta_data ->> 'name', '')), ''),
    new.raw_user_meta_data ->> 'avatar_url',
    coalesce(nullif(new.raw_user_meta_data ->> 'timezone', ''), 'Asia/Kolkata'),
    coalesce(nullif(new.raw_user_meta_data ->> 'locale', ''), 'en')
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security — a user sees only their own rows
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.user_settings enable row level security;
alter table public.consents      enable row level security;

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- user_settings
drop policy if exists "settings_select_own" on public.user_settings;
create policy "settings_select_own" on public.user_settings
  for select using (auth.uid() = user_id);

drop policy if exists "settings_insert_own" on public.user_settings;
create policy "settings_insert_own" on public.user_settings
  for insert with check (auth.uid() = user_id);

drop policy if exists "settings_update_own" on public.user_settings;
create policy "settings_update_own" on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- consents (insert + read only; no update or delete, so the trail stays intact)
drop policy if exists "consents_select_own" on public.consents;
create policy "consents_select_own" on public.consents
  for select using (auth.uid() = user_id);

drop policy if exists "consents_insert_own" on public.consents;
create policy "consents_insert_own" on public.consents
  for insert with check (auth.uid() = user_id);

-- The view runs with the querying user's rights, so RLS on consents applies.
alter view public.current_consents set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- Grants (RLS still decides row visibility)
-- ---------------------------------------------------------------------------
grant select, insert, update on public.profiles      to authenticated;
grant select, insert, update on public.user_settings to authenticated;
grant select, insert         on public.consents      to authenticated;
grant select                 on public.current_consents to authenticated;
