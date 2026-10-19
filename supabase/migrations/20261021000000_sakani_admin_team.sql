-- Admin team management from the admin dashboard. Safe to run more than once.
-- These functions must live in the exposed `public` schema so the app can call them,
-- so each one checks admin membership itself before doing anything.

create or replace function public.admin_team()
returns table (user_id uuid, email text, added_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
    select a.user_id, u.email::text, a.created_at, u.last_sign_in_at, u.email_confirmed_at is not null
    from public.admin_users a
    join auth.users u on u.id = a.user_id
    order by a.created_at;
end;
$$;

-- Returns 'added', 'already_admin' or 'not_found'.
create or replace function public.admin_team_add(target_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  select id into target_id
  from auth.users
  where lower(email) = lower(trim(target_email))
    and coalesce(is_anonymous, false) = false
  limit 1;

  if target_id is null then
    return 'not_found';
  end if;

  insert into public.admin_users (user_id)
  values (target_id)
  on conflict (user_id) do nothing;

  return case when found then 'added' else 'already_admin' end;
end;
$$;

-- Returns 'removed', 'not_admin_member' or 'cannot_remove_self'.
create or replace function public.admin_team_remove(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  -- Prevents admins from locking themselves (and possibly everyone) out.
  if target_user_id = (select auth.uid()) then
    return 'cannot_remove_self';
  end if;

  delete from public.admin_users where user_id = target_user_id;
  return case when found then 'removed' else 'not_admin_member' end;
end;
$$;

revoke all on function public.admin_team() from public, anon;
revoke all on function public.admin_team_add(text) from public, anon;
revoke all on function public.admin_team_remove(uuid) from public, anon;
grant execute on function public.admin_team() to authenticated;
grant execute on function public.admin_team_add(text) to authenticated;
grant execute on function public.admin_team_remove(uuid) to authenticated;
