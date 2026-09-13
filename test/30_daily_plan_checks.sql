-- Behaviour checks for Today's Plan. Runs after 00/0001-0004 on a fresh
-- database that already has the two users from 10_rls_checks.sql, or seeds
-- its own if run standalone.
\set ON_ERROR_STOP on

insert into auth.users (id, email, raw_user_meta_data) values
  ('dddddddd-0000-0000-0000-000000000001', 'plan1@example.com', '{"display_name":"Priya"}'),
  ('dddddddd-0000-0000-0000-000000000002', 'plan2@example.com', '{"display_name":"Noor"}')
on conflict (id) do nothing;

set "request.jwt.claim.sub" = 'dddddddd-0000-0000-0000-000000000001';
set role authenticated;

-- A user creates today's five tasks.
insert into public.daily_plan_items (user_id, task) values
  ('dddddddd-0000-0000-0000-000000000001', 'breathing'),
  ('dddddddd-0000-0000-0000-000000000001', 'walk'),
  ('dddddddd-0000-0000-0000-000000000001', 'water'),
  ('dddddddd-0000-0000-0000-000000000001', 'exercise'),
  ('dddddddd-0000-0000-0000-000000000001', 'reading');

do $$
begin
  if (select count(*) from public.daily_plan_items where user_id = 'dddddddd-0000-0000-0000-000000000001') <> 5 then
    raise exception 'FAIL: expected 5 plan rows for today';
  end if;
  raise notice 'PASS: five tasks created for today';
end $$;

-- Re-inserting the same day's tasks is a no-op, not an error, so the client
-- can safely "ensure today's plan exists" on every visit.
do $$
begin
  insert into public.daily_plan_items (user_id, task)
  values ('dddddddd-0000-0000-0000-000000000001', 'breathing')
  on conflict (user_id, on_date, task) do nothing;

  if (select count(*) from public.daily_plan_items
        where user_id = 'dddddddd-0000-0000-0000-000000000001' and task = 'breathing') <> 1 then
    raise exception 'FAIL: re-ensuring today''s plan created a duplicate';
  end if;
  raise notice 'PASS: ensuring an existing task is a no-op';
end $$;

-- Checking a task off sets completed_at automatically.
update public.daily_plan_items
   set completed = true
 where user_id = 'dddddddd-0000-0000-0000-000000000001' and task = 'walk';

do $$
declare row_now record;
begin
  select * into row_now from public.daily_plan_items
   where user_id = 'dddddddd-0000-0000-0000-000000000001' and task = 'walk';
  if row_now.completed_at is null then
    raise exception 'FAIL: completed_at not set when checking a task off';
  end if;
  raise notice 'PASS: completed_at set automatically on completion';
end $$;

-- A client cannot forge a completion time, or fake an earlier one.
update public.daily_plan_items
   set completed = true, completed_at = now() - interval '3 days'
 where user_id = 'dddddddd-0000-0000-0000-000000000001' and task = 'water';

do $$
declare row_now record;
begin
  select * into row_now from public.daily_plan_items
   where user_id = 'dddddddd-0000-0000-0000-000000000001' and task = 'water';
  if row_now.completed_at < now() - interval '1 minute' then
    raise exception 'FAIL: client-supplied completed_at was accepted';
  end if;
  raise notice 'PASS: completed_at cannot be backdated by the client';
end $$;

-- Unchecking clears completed_at.
update public.daily_plan_items
   set completed = false
 where user_id = 'dddddddd-0000-0000-0000-000000000001' and task = 'walk';

do $$
declare row_now record;
begin
  select * into row_now from public.daily_plan_items
   where user_id = 'dddddddd-0000-0000-0000-000000000001' and task = 'walk';
  if row_now.completed_at is not null then
    raise exception 'FAIL: completed_at not cleared when unchecking';
  end if;
  raise notice 'PASS: unchecking clears completed_at';
end $$;

-- Cannot insert a duplicate task for the same day outright (no on conflict).
do $$
begin
  begin
    insert into public.daily_plan_items (user_id, task)
    values ('dddddddd-0000-0000-0000-000000000001', 'exercise');
    raise exception 'FAIL: duplicate task for the same day was accepted';
  exception when unique_violation then
    raise notice 'PASS: one row per user, day and task';
  end;
end $$;

-- A user cannot create or edit another user's plan.
do $$
begin
  begin
    insert into public.daily_plan_items (user_id, task)
    values ('dddddddd-0000-0000-0000-000000000002', 'breathing');
    raise exception 'FAIL: created a plan item for another user';
  exception when insufficient_privilege then
    raise notice 'PASS: cannot create another user''s plan item';
  end;
end $$;

reset role;
insert into public.daily_plan_items (user_id, task, completed)
values ('dddddddd-0000-0000-0000-000000000002', 'reading', true);

set "request.jwt.claim.sub" = 'dddddddd-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare n integer;
begin
  update public.daily_plan_items set completed = false
   where user_id = 'dddddddd-0000-0000-0000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: updated % of another user''s plan rows', n;
  end if;
  raise notice 'PASS: cannot update another user''s plan item';
end $$;

do $$
begin
  if (select count(*) from public.daily_plan_items where user_id = 'dddddddd-0000-0000-0000-000000000002') <> 0 then
    raise exception 'FAIL: another user''s plan items are visible';
  end if;
  raise notice 'PASS: cannot see another user''s plan items';
end $$;

-- Staff can see everyone's plan (for the weekly numbers) but this checks the
-- read path specifically, not write.
reset role;
update public.profiles set is_staff = true where id = 'dddddddd-0000-0000-0000-000000000001';
set "request.jwt.claim.sub" = 'dddddddd-0000-0000-0000-000000000001';
set role authenticated;

do $$
begin
  if (select count(*) from public.daily_plan_items) < 6 then
    raise exception 'FAIL: staff should see plan items across users';
  end if;
  raise notice 'PASS: staff can read all plan items';
end $$;

reset role;
update public.profiles set is_staff = false where id = 'dddddddd-0000-0000-0000-000000000001';

-- Export covers the new table.
set "request.jwt.claim.sub" = 'dddddddd-0000-0000-0000-000000000001';
set role authenticated;

do $$
declare doc jsonb;
begin
  doc := public.export_my_data();
  if jsonb_array_length(doc -> 'daily_plan_items') <> 5 then
    raise exception 'FAIL: export missing daily plan items (got %)',
      jsonb_array_length(doc -> 'daily_plan_items');
  end if;
  raise notice 'PASS: export covers daily plan items';
end $$;

reset role;
