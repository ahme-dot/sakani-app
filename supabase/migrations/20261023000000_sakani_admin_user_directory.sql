-- Admin-only directory of users (accounts and guests with listings) and their listing counts.
-- auth.users is private, so admins read it only through this function. Safe to run more than once.

create or replace function public.admin_user_directory()
returns table (
  user_id uuid,
  email text,
  full_name text,
  is_guest boolean,
  is_admin boolean,
  joined_at timestamptz,
  last_sign_in_at timestamptz,
  listings_total bigint,
  listings_pending bigint,
  listings_approved bigint,
  listings_rejected bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;

  return query
    select
      u.id,
      coalesce(u.email, '')::text,
      coalesce(u.raw_user_meta_data ->> 'full_name', '')::text,
      coalesce(u.is_anonymous, false),
      exists (select 1 from public.admin_users a where a.user_id = u.id),
      u.created_at,
      u.last_sign_in_at,
      count(p.id),
      count(p.id) filter (where p.status = 'pending'),
      count(p.id) filter (where p.status = 'approved'),
      count(p.id) filter (where p.status = 'rejected')
    from auth.users u
    left join public.properties p on p.owner_id = u.id
    group by u.id
    -- Guests without listings are just abandoned browser sessions; leave them out.
    having coalesce(u.is_anonymous, false) = false or count(p.id) > 0
    order by u.created_at desc;
end;
$$;

revoke all on function public.admin_user_directory() from public, anon;
grant execute on function public.admin_user_directory() to authenticated;
