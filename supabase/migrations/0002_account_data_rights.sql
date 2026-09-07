-- Occlumency — Module 1b: data export and account deletion
-- Gives every pilot user a working "download my data" and "delete my account".

-- ---------------------------------------------------------------------------
-- export_my_data() — everything we hold about the calling user, as one JSON doc
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
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at
      )
      from auth.users u where u.id = uid
    ),
    'profile',  (select to_jsonb(p) - 'id' from public.profiles p where p.id = uid),
    'settings', (select to_jsonb(s) - 'user_id' from public.user_settings s where s.user_id = uid),
    'consents', coalesce(
      (select jsonb_agg(to_jsonb(c) - 'user_id' order by c.created_at)
       from public.consents c where c.user_id = uid),
      '[]'::jsonb
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.export_my_data() from public;
grant execute on function public.export_my_data() to authenticated;

comment on function public.export_my_data() is
  'Returns all stored data for the calling user. Extend the JSON as new modules add tables.';

-- ---------------------------------------------------------------------------
-- delete_my_account() — hard delete, cascades through every user table
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Every user table references auth.users (directly or via profiles)
  -- with on delete cascade, so this one delete clears the account.
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

comment on function public.delete_my_account() is
  'Irreversible. Deletes the auth user; all profile, settings and consent rows cascade away.';
