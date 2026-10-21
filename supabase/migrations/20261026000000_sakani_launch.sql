-- Launch readiness: in-person verification records, and view / WhatsApp-click counts per listing.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1) Verification visits
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists verified_at timestamptz;

create table if not exists public.listing_verifications (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.properties (id) on delete cascade,
  visited_on date not null,
  checklist jsonb not null default '{}'::jsonb,
  notes text check (notes is null or char_length(notes) <= 1000),
  verified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists listing_verifications_listing_idx on public.listing_verifications (listing_id, created_at desc);

alter table public.listing_verifications enable row level security;
revoke all on public.listing_verifications from anon;
grant select on public.listing_verifications to authenticated;

drop policy if exists "Admins can read verification visits" on public.listing_verifications;
create policy "Admins can read verification visits"
  on public.listing_verifications for select to authenticated
  using ((select public.is_admin()));

-- Records a visit and marks the listing verified. Admin only.
create or replace function public.admin_verify_listing(target_listing uuid, visit_date date, visit_checklist jsonb, visit_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if visit_date > current_date then
    raise exception 'visit_in_future' using errcode = '22023';
  end if;

  insert into public.listing_verifications (listing_id, visited_on, checklist, notes, verified_by)
  values (target_listing, visit_date, coalesce(visit_checklist, '{}'::jsonb), nullif(trim(visit_notes), ''), (select auth.uid()));

  update public.properties
  set verified = true, verified_at = visit_date::timestamptz
  where id = target_listing;
end;
$$;

create or replace function public.admin_unverify_listing(target_listing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  update public.properties set verified = false, verified_at = null where id = target_listing;
end;
$$;

revoke all on function public.admin_verify_listing(uuid, date, jsonb, text) from public, anon;
revoke all on function public.admin_unverify_listing(uuid) from public, anon;
grant execute on function public.admin_verify_listing(uuid, date, jsonb, text) to authenticated;
grant execute on function public.admin_unverify_listing(uuid) to authenticated;

-- Same guard as before; non-admins also can't set verified_at.
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

  if public.is_admin() or current_setting('sakani.listing_transfer', true) = 'on' then
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

-- ---------------------------------------------------------------------------
-- 2) Listing views and WhatsApp clicks
-- ---------------------------------------------------------------------------
create table if not exists public.listing_events (
  id bigint generated always as identity primary key,
  listing_id uuid not null references public.properties (id) on delete cascade,
  kind text not null check (kind in ('view', 'whatsapp')),
  created_at timestamptz not null default now()
);

create index if not exists listing_events_listing_kind_idx on public.listing_events (listing_id, kind);

alter table public.listing_events enable row level security;
grant insert on public.listing_events to anon, authenticated;

-- Anyone may record an event for a published listing; nobody reads the raw table (counts come from the functions below).
drop policy if exists "Anyone can record events on published listings" on public.listing_events;
create policy "Anyone can record events on published listings"
  on public.listing_events for insert to anon, authenticated
  with check (exists (select 1 from public.properties p where p.id = listing_id and p.status = 'approved'));

-- Flood guard: at most 300 events per listing per hour.
create or replace function public.listing_events_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.listing_events
      where listing_id = new.listing_id and created_at > now() - interval '1 hour') >= 300 then
    return null; -- silently drop instead of erroring in the visitor's browser
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists listing_events_guard on public.listing_events;
create trigger listing_events_guard
  before insert on public.listing_events
  for each row execute function public.listing_events_guard();

-- Counts for listings the caller may see: admins get any listing, owners only their own.
create or replace function public.listing_stats(listing_ids uuid[])
returns table (listing_id uuid, views bigint, whatsapp_clicks bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         count(e.id) filter (where e.kind = 'view'),
         count(e.id) filter (where e.kind = 'whatsapp')
  from public.properties p
  left join public.listing_events e on e.listing_id = p.id
  where p.id = any(listing_ids)
    and (public.is_admin() or p.owner_id = (select auth.uid()))
  group by p.id;
$$;

revoke all on function public.listing_stats(uuid[]) from public, anon;
grant execute on function public.listing_stats(uuid[]) to authenticated;
