-- Behaviour checks for module 1. Each block raises if the expectation fails.
\set ON_ERROR_STOP on

-- Two users sign up.
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'alex@example.com', '{"display_name":"Alex","timezone":"Asia/Kolkata"}'),
  ('22222222-2222-2222-2222-222222222222', 'sam@example.com',  '{"full_name":"Sam"}');

do $$
begin
  if (select count(*) from public.profiles) <> 2 then
    raise exception 'FAIL: signup trigger did not create both profiles';
  end if;
  if (select count(*) from public.user_settings) <> 2 then
    raise exception 'FAIL: signup trigger did not create both settings rows';
  end if;
  if (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'Alex' then
    raise exception 'FAIL: display_name not copied from user metadata';
  end if;
  if (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222') <> 'Sam' then
    raise exception 'FAIL: full_name fallback not used';
  end if;
  if (select theme from public.user_settings where user_id = '11111111-1111-1111-1111-111111111111') <> 'system' then
    raise exception 'FAIL: default theme wrong';
  end if;
  raise notice 'PASS: signup provisions profile + settings';
end $$;

-- Act as Alex.
set "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
set role authenticated;

do $$
begin
  if (select count(*) from public.profiles) <> 1 then
    raise exception 'FAIL: RLS leaked other profiles (saw %)', (select count(*) from public.profiles);
  end if;
  if (select count(*) from public.user_settings) <> 1 then
    raise exception 'FAIL: RLS leaked other settings';
  end if;
  raise notice 'PASS: RLS scopes reads to the current user';
end $$;

-- Alex edits their own profile.
update public.profiles set display_name = 'Alex L', timezone = 'Asia/Kolkata'
  where id = '11111111-1111-1111-1111-111111111111';
do $$
begin
  if (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') <> 'Alex L' then
    raise exception 'FAIL: own-profile update did not apply';
  end if;
  if (select updated_at > created_at from public.profiles where id = '11111111-1111-1111-1111-111111111111') is not true then
    raise exception 'FAIL: updated_at trigger did not fire';
  end if;
  raise notice 'PASS: own-profile update + updated_at trigger';
end $$;

-- Alex tries to edit Sam. Should touch zero rows.
do $$
declare n integer;
begin
  update public.profiles set display_name = 'hacked'
    where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: cross-user update affected % rows', n;
  end if;
  raise notice 'PASS: cross-user update blocked';
end $$;

-- Alex tries to insert a profile for someone else. Should be rejected.
do $$
begin
  begin
    insert into public.profiles (id) values ('33333333-3333-3333-3333-333333333333');
    raise exception 'FAIL: insert for another user was allowed';
  exception when insufficient_privilege then
    raise notice 'PASS: cross-user insert blocked by RLS';
  end;
end $$;

-- Consent records.
insert into public.consents (user_id, kind, version, granted) values
  ('11111111-1111-1111-1111-111111111111', 'terms',   '2026-09-01', true),
  ('11111111-1111-1111-1111-111111111111', 'privacy', '2026-09-01', true),
  ('11111111-1111-1111-1111-111111111111', 'marketing', '2026-09-01', true);
insert into public.consents (user_id, kind, version, granted) values
  ('11111111-1111-1111-1111-111111111111', 'marketing', '2026-09-01', false);

do $$
begin
  if (select granted from public.current_consents
      where user_id = '11111111-1111-1111-1111-111111111111' and kind = 'marketing') <> false then
    raise exception 'FAIL: current_consents did not pick the latest row';
  end if;
  if (select count(*) from public.current_consents) <> 3 then
    raise exception 'FAIL: current_consents row count wrong';
  end if;
  raise notice 'PASS: consent withdrawal reflected in current_consents';
end $$;

-- Data export.
do $$
declare doc jsonb;
begin
  doc := public.export_my_data();
  if doc -> 'account' ->> 'email' <> 'alex@example.com' then
    raise exception 'FAIL: export missing account email';
  end if;
  if doc -> 'profile' ->> 'display_name' <> 'Alex L' then
    raise exception 'FAIL: export missing profile';
  end if;
  if jsonb_array_length(doc -> 'consents') <> 4 then
    raise exception 'FAIL: export consent count wrong (got %)', jsonb_array_length(doc -> 'consents');
  end if;
  raise notice 'PASS: export_my_data returns the full record';
end $$;

-- Account deletion cascades.
select public.delete_my_account();

-- Assertions run as the owner: auth.users is not readable by `authenticated`,
-- which is itself the correct posture.
reset role;

do $$
begin
  if exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'FAIL: auth user not deleted';
  end if;
  if exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'FAIL: profile did not cascade';
  end if;
  if exists (select 1 from public.consents where user_id = '11111111-1111-1111-1111-111111111111') then
    raise exception 'FAIL: consents did not cascade';
  end if;
  if not exists (select 1 from auth.users where id = '22222222-2222-2222-2222-222222222222') then
    raise exception 'FAIL: deletion removed the wrong user';
  end if;
  raise notice 'PASS: delete_my_account cascades and spares other users';
end $$;

reset role;
