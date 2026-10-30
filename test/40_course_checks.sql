-- Behaviour checks for free courses and course progress. Runs after
-- 00/0001-0005 on a fresh database; seeds its own two users so it can run
-- standalone or as part of the full suite.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('eeeeeeee-0000-0000-0000-000000000001', 'course1@example.com', '{"display_name":"Zoya"}'),
  ('eeeeeeee-0000-0000-0000-000000000002', 'course2@example.com', '{"display_name":"Tenzin"}')
on conflict (id) do nothing;

-- Staff adds two courses, one of them not yet visible to the pilot.
insert into public.courses (id, title, provider, url, topic, estimated_minutes, status) values
  ('eeeeeeee-1111-0000-0000-000000000001', 'Neuroplasticity', 'Alison',
   'https://alison.com/course/neuroplasticity', 'neuroplasticity', 330, 'pilot'),
  ('eeeeeeee-1111-0000-0000-000000000002', 'Draft Course', 'Internal',
   'https://example.com/draft', 'other', 30, 'paused')
on conflict (id) do nothing;

-- A malformed link is rejected outright.
do $$
begin
  begin
    insert into public.courses (title, provider, url)
    values ('Bad link', 'Nobody', 'not-a-url');
    raise exception 'FAIL: a non-url link was accepted';
  exception when check_violation then
    raise notice 'PASS: course url must look like a link';
  end;
end $$;

set "request.jwt.claim.sub" = 'eeeeeeee-0000-0000-0000-000000000001';
set role authenticated;

-- The catalog only shows pilot-status courses.
do $$
begin
  if (select count(*) from public.course_directory) <> 1 then
    raise exception 'FAIL: expected exactly one visible course';
  end if;
  if exists (select 1 from public.course_directory where title = 'Draft Course') then
    raise exception 'FAIL: a non-pilot course leaked into the catalog';
  end if;
  raise notice 'PASS: the catalog only lists pilot-status courses';
end $$;

-- A user cannot add their own entry to the catalog.
do $$
begin
  begin
    insert into public.courses (title, provider, url) values ('Mine', 'Me', 'https://example.com');
    raise exception 'FAIL: a non-staff user added a course';
  exception when insufficient_privilege then
    raise notice 'PASS: only staff can write the course catalog';
  end;
end $$;

-- Starting a course creates a row with started_at set, status in_progress.
insert into public.course_progress (user_id, course_id)
values ('eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-1111-0000-0000-000000000001');

do $$
declare row_now record;
begin
  select * into row_now from public.course_progress
   where user_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and course_id = 'eeeeeeee-1111-0000-0000-000000000001';
  if row_now.status <> 'in_progress' or row_now.started_at is null or row_now.completed_at is not null then
    raise exception 'FAIL: starting a course did not leave it in_progress with started_at set';
  end if;
  raise notice 'PASS: starting a course sets started_at and leaves it in_progress';
end $$;

-- Marking it complete sets completed_at automatically.
update public.course_progress set status = 'completed'
 where user_id = 'eeeeeeee-0000-0000-0000-000000000001'
   and course_id = 'eeeeeeee-1111-0000-0000-000000000001';

do $$
declare row_now record;
begin
  select * into row_now from public.course_progress
   where user_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and course_id = 'eeeeeeee-1111-0000-0000-000000000001';
  if row_now.completed_at is null then
    raise exception 'FAIL: completed_at not set when marking a course complete';
  end if;
  raise notice 'PASS: completed_at set automatically on completion';
end $$;

-- A client cannot forge an earlier completion time.
update public.course_progress
   set status = 'completed', completed_at = now() - interval '10 days'
 where user_id = 'eeeeeeee-0000-0000-0000-000000000001'
   and course_id = 'eeeeeeee-1111-0000-0000-000000000001';

do $$
declare row_now record;
begin
  select * into row_now from public.course_progress
   where user_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and course_id = 'eeeeeeee-1111-0000-0000-000000000001';
  if row_now.completed_at < now() - interval '1 minute' then
    raise exception 'FAIL: client-supplied completed_at was accepted';
  end if;
  raise notice 'PASS: completed_at cannot be backdated by the client';
end $$;

-- Reopening clears completed_at but leaves started_at untouched.
do $$
declare before_start timestamptz;
declare row_now record;
begin
  select started_at into before_start from public.course_progress
   where user_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and course_id = 'eeeeeeee-1111-0000-0000-000000000001';

  update public.course_progress set status = 'in_progress'
   where user_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and course_id = 'eeeeeeee-1111-0000-0000-000000000001';

  select * into row_now from public.course_progress
   where user_id = 'eeeeeeee-0000-0000-0000-000000000001'
     and course_id = 'eeeeeeee-1111-0000-0000-000000000001';

  if row_now.completed_at is not null then
    raise exception 'FAIL: completed_at not cleared when reopening';
  end if;
  if row_now.started_at <> before_start then
    raise exception 'FAIL: started_at changed on reopen — it should be fixed for good';
  end if;
  raise notice 'PASS: reopening clears completed_at and never moves started_at';
end $$;

-- One progress row per user per course — tracking the same course twice fails outright.
do $$
begin
  begin
    insert into public.course_progress (user_id, course_id)
    values ('eeeeeeee-0000-0000-0000-000000000001', 'eeeeeeee-1111-0000-0000-000000000001');
    raise exception 'FAIL: a duplicate progress row for the same course was accepted';
  exception when unique_violation then
    raise notice 'PASS: one progress row per user and course';
  end;
end $$;

-- A user cannot create progress rows for another user.
do $$
begin
  begin
    insert into public.course_progress (user_id, course_id)
    values ('eeeeeeee-0000-0000-0000-000000000002', 'eeeeeeee-1111-0000-0000-000000000001');
    raise exception 'FAIL: created a progress row for another user';
  exception when insufficient_privilege then
    raise notice 'PASS: cannot create another user''s course progress';
  end;
end $$;

reset role;
insert into public.course_progress (user_id, course_id, status)
values ('eeeeeeee-0000-0000-0000-000000000002', 'eeeeeeee-1111-0000-0000-000000000001', 'completed');

set "request.jwt.claim.sub" = 'eeeeeeee-0000-0000-0000-000000000001';
set role authenticated;

-- Cannot update or see another user's progress.
do $$
declare n integer;
begin
  update public.course_progress set status = 'in_progress'
   where user_id = 'eeeeeeee-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: updated % of another user''s progress rows', n;
  end if;
  raise notice 'PASS: cannot update another user''s course progress';
end $$;

do $$
begin
  if (select count(*) from public.course_progress where user_id = 'eeeeeeee-0000-0000-0000-000000000002') <> 0 then
    raise exception 'FAIL: another user''s course progress is visible';
  end if;
  raise notice 'PASS: cannot see another user''s course progress';
end $$;

-- Staff can see everyone's progress, for the weekly numbers.
reset role;
update public.profiles set is_staff = true where id = 'eeeeeeee-0000-0000-0000-000000000001';
set "request.jwt.claim.sub" = 'eeeeeeee-0000-0000-0000-000000000001';
set role authenticated;

do $$
begin
  if (select count(*) from public.course_progress) < 2 then
    raise exception 'FAIL: staff should see course progress across users';
  end if;
  raise notice 'PASS: staff can read all course progress';
end $$;

reset role;
update public.profiles set is_staff = false where id = 'eeeeeeee-0000-0000-0000-000000000001';

-- Export covers the user's own course progress.
set "request.jwt.claim.sub" = 'eeeeeeee-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare doc jsonb;
begin
  doc := public.export_my_data();
  if jsonb_array_length(doc -> 'course_progress') <> 1 then
    raise exception 'FAIL: export missing course progress (got %)',
      jsonb_array_length(doc -> 'course_progress');
  end if;
  raise notice 'PASS: export covers course progress';
end $$;

reset role;
