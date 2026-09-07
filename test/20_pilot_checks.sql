-- Behaviour checks for the pilot modules. Runs after 10_rls_checks.sql on a
-- fresh database, so it seeds its own users.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'staff@occlumencyai.com', '{"display_name":"Vishma"}'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'user1@example.com',      '{"display_name":"User One"}'),
  ('cccccccc-0000-0000-0000-000000000003', 'user2@example.com',      '{"display_name":"User Two"}');

update public.profiles set is_staff = true where id = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into public.providers (id, name, category, session_fee, contact_phone, status) values
  ('11111111-aaaa-0000-0000-000000000001', 'Dr Anita R',  'counsellor', 900,  '+919000000001', 'pilot'),
  ('11111111-aaaa-0000-0000-000000000002', 'Ravi K',      'yoga',       600,  '+919000000002', 'pilot'),
  ('11111111-aaaa-0000-0000-000000000003', 'Dropped One', 'coach',      1200, '+919000000003', 'dropped');

-- ---------------------------------------------------------------------------
-- As a regular user
-- ---------------------------------------------------------------------------
set "request.jwt.claim.sub" = 'bbbbbbbb-0000-0000-0000-000000000002';
set role authenticated;

do $$
begin
  if (select count(*) from public.provider_directory) <> 2 then
    raise exception 'FAIL: directory should show only pilot providers, saw %',
      (select count(*) from public.provider_directory);
  end if;
  raise notice 'PASS: directory hides non-pilot providers';
end $$;

-- The directory view must not carry contact details.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'provider_directory'
      and column_name in ('contact_phone', 'contact_email', 'notes', 'recruited_via')
  ) then
    raise exception 'FAIL: provider_directory leaks internal contact columns';
  end if;
  raise notice 'PASS: provider contact details stay off the client';
end $$;

-- A user cannot edit the provider roster.
do $$
declare n integer;
begin
  update public.providers set session_fee = 1 where status = 'pilot';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: non-staff updated % provider rows', n;
  end if;
  raise notice 'PASS: providers are read-only for non-staff';
end $$;

-- Booking request for themselves.
insert into public.booking_requests (user_id, provider_id, preferred_day, note)
values ('bbbbbbbb-0000-0000-0000-000000000002',
        '11111111-aaaa-0000-0000-000000000001',
        current_date + 3, 'Evening preferred');

-- ...but not on someone else's behalf.
do $$
begin
  begin
    insert into public.booking_requests (user_id, provider_id)
    values ('cccccccc-0000-0000-0000-000000000003', '11111111-aaaa-0000-0000-000000000001');
    raise exception 'FAIL: booked on behalf of another user';
  exception when insufficient_privilege then
    raise notice 'PASS: cannot create a booking for someone else';
  end;
end $$;

-- A user cannot record their own sessions (that would let them invent revenue).
do $$
begin
  begin
    insert into public.sessions (user_id, provider_id, held_on, fee, commission)
    values ('bbbbbbbb-0000-0000-0000-000000000002',
            '11111111-aaaa-0000-0000-000000000001', current_date, 900, 180);
    raise exception 'FAIL: non-staff wrote a session row';
  exception when insufficient_privilege then
    raise notice 'PASS: only staff can record sessions';
  end;
end $$;

-- Check-ins: one per day, enforced.
insert into public.checkins (user_id, on_date, mood)
values ('bbbbbbbb-0000-0000-0000-000000000002', current_date,     'good'),
       ('bbbbbbbb-0000-0000-0000-000000000002', current_date - 1, 'okay'),
       ('bbbbbbbb-0000-0000-0000-000000000002', current_date - 2, 'great');

do $$
begin
  begin
    insert into public.checkins (user_id, on_date, mood)
    values ('bbbbbbbb-0000-0000-0000-000000000002', current_date, 'low');
    raise exception 'FAIL: two check-ins allowed on the same day';
  exception when unique_violation then
    raise notice 'PASS: one check-in per user per day';
  end;
end $$;

do $$
declare s integer;
begin
  s := public.my_streak();
  if s <> 3 then raise exception 'FAIL: streak should be 3, got %', s; end if;
  raise notice 'PASS: streak counts consecutive days';
end $$;

-- A gap breaks the streak.
insert into public.checkins (user_id, on_date, mood)
values ('bbbbbbbb-0000-0000-0000-000000000002', current_date - 5, 'low');

do $$
declare s integer;
begin
  s := public.my_streak();
  if s <> 3 then raise exception 'FAIL: gap should not extend streak, got %', s; end if;
  raise notice 'PASS: a gap does not extend the streak';
end $$;

-- Export covers the new tables.
do $$
declare doc jsonb;
begin
  doc := public.export_my_data();
  if jsonb_array_length(doc -> 'checkins') <> 4 then
    raise exception 'FAIL: export missing check-ins (got %)', jsonb_array_length(doc -> 'checkins');
  end if;
  if jsonb_array_length(doc -> 'booking_requests') <> 1 then
    raise exception 'FAIL: export missing booking requests';
  end if;
  raise notice 'PASS: export covers pilot data';
end $$;

-- Cannot see another user's check-ins.
reset role;
insert into public.checkins (user_id, on_date, mood)
values ('cccccccc-0000-0000-0000-000000000003', current_date, 'stressed');

set "request.jwt.claim.sub" = 'bbbbbbbb-0000-0000-0000-000000000002';
set role authenticated;
do $$
begin
  if (select count(*) from public.checkins) <> 4 then
    raise exception 'FAIL: check-ins leaked across users (saw %)', (select count(*) from public.checkins);
  end if;
  raise notice 'PASS: check-ins stay private to their owner';
end $$;

-- ---------------------------------------------------------------------------
-- As staff
-- ---------------------------------------------------------------------------
reset role;
set "request.jwt.claim.sub" = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;

do $$
begin
  if (select count(*) from public.providers) <> 3 then
    raise exception 'FAIL: staff should see dropped providers too';
  end if;
  raise notice 'PASS: staff see the full provider roster';
end $$;

insert into public.sessions (user_id, provider_id, held_on, fee, commission, collected) values
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000001', current_date,     900, 180, true),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-aaaa-0000-0000-000000000002', current_date - 1, 600, 120, true),
  ('cccccccc-0000-0000-0000-000000000003', '11111111-aaaa-0000-0000-000000000001', current_date,     900, 180, false);

do $$
declare row_now record;
begin
  select * into row_now from public.pilot_weekly
   where week_start = date_trunc('week', current_date)::date;

  if row_now.sessions_completed < 2 then
    raise exception 'FAIL: weekly session count wrong (%)', row_now.sessions_completed;
  end if;
  if row_now.money_collected <> 180 then
    raise exception 'FAIL: uncollected money counted as revenue (%)', row_now.money_collected;
  end if;
  if row_now.repeat_users <> 1 then
    raise exception 'FAIL: repeat user count wrong (%)', row_now.repeat_users;
  end if;
  raise notice 'PASS: pilot_weekly counts sessions, collected money and repeat users';
end $$;

-- Commission cannot exceed the fee.
do $$
begin
  begin
    insert into public.sessions (user_id, provider_id, held_on, fee, commission)
    values ('bbbbbbbb-0000-0000-0000-000000000002',
            '11111111-aaaa-0000-0000-000000000001', current_date, 500, 900);
    raise exception 'FAIL: commission larger than fee was accepted';
  exception when check_violation then
    raise notice 'PASS: commission cannot exceed the session fee';
  end;
end $$;

reset role;
