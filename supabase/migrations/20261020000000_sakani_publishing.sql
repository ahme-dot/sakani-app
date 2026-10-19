-- Publishing readiness: real verification, multiple photos, review notes,
-- owner edits/removals, and abuse limits. Safe to run more than once.

alter table public.properties
  add column if not exists verified boolean not null default false,
  add column if not exists image_urls text[] not null default '{}',
  add column if not exists rejection_reason text,
  add column if not exists updated_at timestamptz not null default now();

update public.properties
set image_urls = array[image_url]
where cardinality(image_urls) = 0 and image_url <> '';

alter table public.properties drop constraint if exists properties_image_urls_count;
alter table public.properties add constraint properties_image_urls_count
  check (cardinality(image_urls) between 1 and 6);

alter table public.properties drop constraint if exists properties_rejection_reason_length;
alter table public.properties add constraint properties_rejection_reason_length
  check (rejection_reason is null or char_length(rejection_reason) <= 500);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()));
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Owners may only change listing content. Review fields are reserved for admins,
-- and every owner edit sends the listing back to review.
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

  if public.is_admin() then
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
    new.rejection_reason := null;
    new.status := 'pending';
    new.created_at := now();
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    new.verified := false;
    new.rejection_reason := null;
    new.status := 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists properties_guard on public.properties;
create trigger properties_guard
  before insert or update on public.properties
  for each row execute function public.properties_guard();

-- Owners can fix and resubmit listings that need changes, and remove listings that are not live.
drop policy if exists "Owners can update their pending properties" on public.properties;
create policy "Owners can update their pending properties"
  on public.properties for update to authenticated
  using (
    (select auth.uid()) = owner_id
    and status in ('pending', 'rejected')
  )
  with check (
    (select auth.uid()) = owner_id
    and status = 'pending'
  );

drop policy if exists "Owners can delete their pending properties" on public.properties;
create policy "Owners can delete their pending properties"
  on public.properties for delete to authenticated
  using (
    (select auth.uid()) = owner_id
    and status in ('pending', 'rejected')
  );

drop policy if exists "Admins can delete property submissions" on public.properties;
create policy "Admins can delete property submissions"
  on public.properties for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can delete property photos" on storage.objects;
create policy "Admins can delete property photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sakani-listings'
    and (select public.is_admin())
  );

-- Search filters used by the public feed.
create index if not exists properties_approved_price_idx
  on public.properties (monthly_price)
  where status = 'approved';
