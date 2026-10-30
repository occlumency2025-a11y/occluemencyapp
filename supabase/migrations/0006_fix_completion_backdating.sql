-- Fixes a gap found while building course_progress: set_plan_completed_at()
-- only forced completed_at to now() on the false -> true transition. If a
-- task was ALREADY completed, a client could resend completed = true with
-- an earlier completed_at and the trigger would wave it through, because
-- there was no transition to catch it on. The fix is the same one used for
-- course_progress: once completed, completed_at is held at its original
-- value no matter what the client sends in a later update, and only a
-- genuine first-time completion sets it from the server clock.
--
-- Written as its own migration rather than editing 0004_daily_plan.sql,
-- because that file has already run against the live pilot database —
-- changing it here would do nothing there. This one will.

create or replace function public.set_plan_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.completed then
    if old is not null and old.completed then
      new.completed_at = old.completed_at; -- already completed — hold the original time
    else
      new.completed_at = now();            -- first time checking it off
    end if;
  else
    new.completed_at = null;
  end if;
  return new;
end;
$$;
