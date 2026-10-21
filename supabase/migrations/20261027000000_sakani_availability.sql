-- Sakani: owners keep listings fresh.
-- 1) New status 'paused' (rented / full): hidden from students, restored by the owner without a new review.
-- 2) Owners confirm "still available", which stamps updated_at (shown publicly as "Updated").
-- Both go through security-definer functions; the owner update policy stays limited to pending/rejected.

alter table public.properties drop constraint if exists properties_status_check;
alter table public.properties
  add constraint properties_status_check check (status in ('pending', 'approved', 'rejected', 'paused'));

-- Guard: same rules as before, plus a bypass for the owner functions below.
create or replace function public.properties_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  new.updated_at := now();

  if public.is_admin()
    or current_setting('sakani.listing_transfer', true) = 'on'
    or current_setting('sakani.owner_action', true) = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    select count(*) into recent_count
    from public.properties
    where owner_id = new.owner_id
      and created_at > now() - interval '24 hours';

    if recent_count >= 5 then
      raise exception 'listing_rate_limit' using errcode = 'P0001',
        hint = 'An owner can submit at most 5 listings per 24 hours.';
    end if;

    new.verified := false;
    new.verified_at := null;
    new.rejection_reason := null;
    new.status := 'pending';
    new.created_at := now();
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    new.verified := false;
    new.verified_at := null;
    new.rejection_reason := null;
    new.status := 'pending';
  end if;

  return new;
end;
$$;

-- Owner pauses (rented / full) or re-publishes their own listing.
-- Only approved <-> paused; a pending or rejected listing can never become approved this way.
create or replace function public.owner_set_listing_paused(target_listing uuid, pause boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status text;
  next_status text;
begin
  select status into current_status
  from public.properties
  where id = target_listing and owner_id = (select auth.uid());

  if current_status is null then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;

  if pause and current_status = 'approved' then
    next_status := 'paused';
  elsif not pause and current_status = 'paused' then
    next_status := 'approved';
  else
    raise exception 'listing_status_not_allowed' using errcode = 'P0001';
  end if;

  perform set_config('sakani.owner_action', 'on', true);
  update public.properties
  set status = next_status
  where id = target_listing;
  perform set_config('sakani.owner_action', 'off', true);

  return next_status;
end;
$$;

-- Owner confirms their published listing is still available.
create or replace function public.confirm_listing(target_listing uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  stamped timestamptz;
begin
  perform set_config('sakani.owner_action', 'on', true);
  update public.properties
  set updated_at = now()
  where id = target_listing
    and owner_id = (select auth.uid())
    and status in ('approved', 'paused')
  returning updated_at into stamped;
  perform set_config('sakani.owner_action', 'off', true);

  if stamped is null then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;

  return stamped;
end;
$$;

revoke all on function public.owner_set_listing_paused(uuid, boolean) from public, anon;
revoke all on function public.confirm_listing(uuid) from public, anon;
grant execute on function public.owner_set_listing_paused(uuid, boolean) to authenticated;
grant execute on function public.confirm_listing(uuid) to authenticated;

-- Owners may also delete a paused listing (it is no longer live).
drop policy if exists "Owners can delete their pending properties" on public.properties;
create policy "Owners can delete their pending properties"
  on public.properties for delete to authenticated
  using (
    (select auth.uid()) = owner_id
    and status in ('pending', 'rejected', 'paused')
  );
