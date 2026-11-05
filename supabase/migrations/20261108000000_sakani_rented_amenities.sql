-- Rented places, how long a place has been listed, and more amenities (2026-11-05).
--
-- 1) A place is "rented" only while someone lives there, until a known end date (rented_until). It then
--    comes back to the search by itself (daily job) and the owner gets a notice. A confirmed booking no
--    longer hides a place before move-in; a cancelled stay brings it back. Rooms and beds are rented
--    only when every free bed is taken. The page of a rented place stays open, with "Rented until".
-- 2) published_at (first time published) and available_since (last time it became free), for the admin.
-- 3) Amenities: furnished (already stored) plus kitchen, washing machine, fridge, water heater, elevator.
--    New ones start empty (null = the owner hasn't said yet).
--
-- Safe to run twice. Run it in the Supabase SQL Editor before pushing the code that uses it.

-- ---------------------------------------------------------------------------
-- A) New columns
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists rented_until date;
-- Who set the rented status: a Sakani stay ("booking") or the owner, rented outside Sakani ("owner").
alter table public.properties add column if not exists rented_source text check (rented_source is null or rented_source in ('booking', 'owner'));
alter table public.properties add column if not exists published_at timestamptz;
alter table public.properties add column if not exists available_since timestamptz;
alter table public.properties add column if not exists kitchen boolean;
alter table public.properties add column if not exists washing_machine boolean;
alter table public.properties add column if not exists fridge boolean;
alter table public.properties add column if not exists water_heater boolean;
alter table public.properties add column if not exists elevator boolean;

-- "Furnished" was stored but never asked, so every "no" so far means "not said". It becomes a real
-- question in the listing form now; older places show it once the owner answers.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'properties' and column_name = 'furnished' and is_nullable = 'NO'
  ) then
    alter table public.properties alter column furnished drop not null;
    alter table public.properties alter column furnished drop default;
    -- Marks the change; the old "no" answers are cleared in section F, with the guard trigger off.
    comment on column public.properties.furnished is 'sakani:furnished-asked';
  end if;
end;
$$;

create index if not exists properties_rented_until_idx on public.properties (rented_until) where status = 'rented';

-- Every column except the owner's number stays readable (same rule as 20261105000000), now including the new ones.
do $$
declare
  readable text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
  into readable
  from information_schema.columns
  where table_schema = 'public' and table_name = 'properties' and column_name <> 'whatsapp_number';
  execute 'revoke select on public.properties from anon, authenticated';
  execute format('grant select (%s) on public.properties to anon, authenticated', readable);
end;
$$;

-- Anyone can open the page of a rented place (it shows "Rented until …"); search still lists approved only.
drop policy if exists "Anyone can read approved properties" on public.properties;
drop policy if exists "Anyone can read published or rented properties" on public.properties;
create policy "Anyone can read published or rented properties"
  on public.properties for select
  using (status in ('approved', 'rented'));

-- ---------------------------------------------------------------------------
-- B) Dates kept by the database, never by the owner
-- ---------------------------------------------------------------------------
create or replace function public.properties_timeline()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Owners can't write these dates themselves.
  -- coalesce: an unset flag reads as NULL, and "not NULL" would skip this check.
  if not (coalesce(public.is_admin(), false)
    or coalesce(current_setting('sakani.owner_action', true), '') = 'on'
    or coalesce(current_setting('sakani.listing_transfer', true), '') = 'on') then
    if tg_op = 'INSERT' then
      new.published_at := null;
      new.available_since := null;
      new.rented_until := null;
      new.rented_source := null;
    else
      new.published_at := old.published_at;
      new.available_since := old.available_since;
      new.rented_until := old.rented_until;
      new.rented_source := old.rented_source;
    end if;
  end if;

  if new.status = 'approved' then
    if new.published_at is null then
      new.published_at := now();
    end if;
    -- Back on the market after a tenancy: it has been free since now.
    if tg_op = 'INSERT' or new.available_since is null or old.status in ('rented', 'reserved') then
      new.available_since := now();
    end if;
    new.rented_until := null;
    new.rented_source := null;
  elsif new.status <> 'rented' then
    new.rented_until := null;
    new.rented_source := null;
  end if;
  return new;
end;
$$;

-- Named to run after properties_guard (triggers of one kind fire in name order).
drop trigger if exists properties_timeline on public.properties;
create trigger properties_timeline
  before insert or update on public.properties
  for each row execute function public.properties_timeline();

-- ---------------------------------------------------------------------------
-- C) Bookings set the place's status
-- ---------------------------------------------------------------------------
-- Rents a place while its stays are running; frees it when none is. Rooms and beds: rented only when
-- every free bed is taken right now. Returns the place's status after the check.
create or replace function public.refresh_listing_occupancy(target_listing uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  place record;
  living integer;
  first_free date;
  last_end date;
  capacity integer;
begin
  select id, status, property_type, available_beds, rented_until, rented_source into place
  from public.properties where id = target_listing;
  if place.id is null or place.status not in ('approved', 'rented', 'reserved') then
    return place.status;
  end if;

  select count(*), min(ends), max(ends) into living, first_free, last_end
  from (
    select (b.move_in + make_interval(months => coalesce(b.months, 1)))::date as ends
    from public.listing_requests b
    where b.listing_id = target_listing
      and b.status in ('moved_in', 'cancellation_requested')
      and (b.move_in + make_interval(months => coalesce(b.months, 1)))::date > current_date
  ) stays;

  capacity := case when place.property_type in ('room', 'bed') then greatest(coalesce(place.available_beds, 1), 1) else 1 end;

  perform set_config('sakani.owner_action', 'on', true);
  if living >= capacity then
    -- A flat is free when its stay ends; a full room when its first bed frees up.
    update public.properties
    set status = 'rented',
        rented_source = 'booking',
        rented_until = case when place.property_type in ('room', 'bed') then first_free else last_end end
    where id = target_listing;
  elsif place.status = 'rented' and place.rented_source = 'owner' and coalesce(place.rented_until, current_date) > current_date then
    null; -- rented outside Sakani until a later date: leave it
  elsif place.status in ('rented', 'reserved') then
    update public.properties set status = 'approved' where id = target_listing;
  end if;
  perform set_config('sakani.owner_action', 'off', true);

  return (select status from public.properties where id = target_listing);
end;
$$;

revoke all on function public.refresh_listing_occupancy(uuid) from public, anon, authenticated;

create or replace function public.booking_listing_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.listing_id is not null
     and new.status in ('moved_in', 'cancelled', 'refund_pending', 'refunded') then
    perform public.refresh_listing_occupancy(new.listing_id);
  end if;
  return new;
end;
$$;

drop trigger if exists booking_listing_status on public.listing_requests;
create trigger booking_listing_status after update on public.listing_requests
  for each row execute function public.booking_listing_status();

-- No new booking that starts while a place is rented outside Sakani.
create or replace function public.booking_not_rented()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  place record;
begin
  if new.listing_id is null or new.move_in is null then
    return new;
  end if;
  select status, rented_until into place from public.properties where id = new.listing_id;
  if place.status = 'rented' and place.rented_until is not null and new.move_in < place.rented_until then
    raise exception 'dates_taken' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_not_rented on public.listing_requests;
create trigger booking_not_rented before insert on public.listing_requests
  for each row execute function public.booking_not_rented();

-- ---------------------------------------------------------------------------
-- D) Owners: "rented outside Sakani" with an end date, and "free again" early
-- ---------------------------------------------------------------------------
drop function if exists public.owner_report_rental(uuid, boolean);
create or replace function public.owner_report_rental(target_listing uuid, via_sakani boolean, rented_until date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing record;
  fee_id uuid;
  fee_amount integer;
  ends date := coalesce(rented_until, (current_date + interval '12 months')::date);
begin
  select id, owner_id, status, title_en, monthly_price, rented_source into listing
  from public.properties
  where id = target_listing and owner_id = (select auth.uid());

  if listing.id is null then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;
  if listing.status = 'rented' and listing.rented_source = 'booking' then
    raise exception 'listing_status_not_allowed' using errcode = 'P0001';
  end if;
  -- A rented place can be reported again to change its end date (same fee, no second one).
  if listing.status not in ('approved', 'paused', 'rented') then
    raise exception 'listing_status_not_allowed' using errcode = 'P0001';
  end if;
  if ends <= current_date or ends > (current_date + interval '5 years')::date then
    raise exception 'invalid_end_date' using errcode = 'P0001';
  end if;

  perform set_config('sakani.owner_action', 'on', true);
  update public.properties set status = 'rented', rented_until = ends, rented_source = 'owner' where id = target_listing;
  perform set_config('sakani.owner_action', 'off', true);

  if via_sakani then
    select id, amount into fee_id, fee_amount
    from public.rental_fees
    where listing_id = target_listing and status in ('due', 'submitted');

    if fee_id is null then
      fee_amount := public.success_fee_for(listing.monthly_price);
      insert into public.rental_fees (listing_id, owner_id, listing_title, monthly_price, amount)
      values (listing.id, listing.owner_id, listing.title_en, listing.monthly_price, fee_amount)
      returning id into fee_id;
    end if;
  end if;

  return jsonb_build_object('status', 'rented', 'rented_until', ends, 'fee_id', fee_id, 'amount', fee_amount);
end;
$$;

revoke all on function public.owner_report_rental(uuid, boolean, date) from public, anon;
grant execute on function public.owner_report_rental(uuid, boolean, date) to authenticated;

-- The tenant left early: the owner (their own place) or an admin puts it back in the search now.
-- Not while a Sakani guest is still living there.
create or replace function public.release_listing(target_listing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.properties
    where id = target_listing and status in ('rented', 'reserved')
      and (owner_id = (select auth.uid()) or public.is_admin())
  ) then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;
  if not public.is_admin() and exists (
    select 1 from public.listing_requests b
    where b.listing_id = target_listing and b.status in ('moved_in', 'cancellation_requested')
      and (b.move_in + make_interval(months => coalesce(b.months, 1)))::date > current_date
  ) then
    raise exception 'guest_still_living' using errcode = 'P0001';
  end if;
  perform set_config('sakani.owner_action', 'on', true);
  update public.properties set status = 'approved' where id = target_listing;
  perform set_config('sakani.owner_action', 'off', true);
end;
$$;

revoke all on function public.release_listing(uuid) from public, anon;
grant execute on function public.release_listing(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- E) Every day: places whose tenancy ended come back, and their owners are told
-- ---------------------------------------------------------------------------
create or replace function public.release_ended_rentals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  place record;
  released integer := 0;
begin
  for place in
    select id, owner_id, title_ar, title_en from public.properties
    where status = 'rented' and rented_until is not null and rented_until <= current_date
  loop
    if public.refresh_listing_occupancy(place.id) = 'approved' then
      released := released + 1;
      perform public.notify_user(place.owner_id, 'listing_available', null,
        jsonb_build_object('title', place.title_ar, 'title_en', place.title_en, 'listing_id', place.id));
    end if;
  end loop;
  return released;
end;
$$;

-- Anyone may run it (it only frees places whose end date has passed), so the admin panel can trigger it too.
revoke all on function public.release_ended_rentals() from public;
grant execute on function public.release_ended_rentals() to anon, authenticated;

-- The daily job, if pg_cron is available (Database → Extensions → pg_cron). Without it, the admin
-- panel runs release_ended_rentals() each time it opens.
do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron is not available; enable it in Database → Extensions for the daily release.';
end;
$$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sakani-release-ended-rentals';
    perform cron.schedule('sakani-release-ended-rentals', '5 22 * * *', 'select public.release_ended_rentals()');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- F) Existing places
-- ---------------------------------------------------------------------------
-- These updates fix stored data, not owner edits: the guard trigger (which sends an edited place back
-- to review and stamps updated_at) and the timeline trigger are off while they run, then back on.
alter table public.properties disable trigger properties_guard;
alter table public.properties disable trigger properties_timeline;

-- Old "furnished: no" answers were never asked, so they become "not said" (once, right after the change above).
update public.properties set furnished = null
where furnished = false
  and (select col_description('public.properties'::regclass, a.attnum) from pg_attribute a
       where a.attrelid = 'public.properties'::regclass and a.attname = 'furnished') = 'sakani:furnished-asked';
comment on column public.properties.furnished is 'Furnished: true, false, or null when the owner has not said.';

-- When each place was first published, and since when it has been free.
update public.properties
set published_at = coalesce(published_at, verified_at, created_at)
where status in ('approved', 'rented', 'reserved', 'paused') and published_at is null;

update public.properties p
set available_since = coalesce(
  (select max((b.move_in + make_interval(months => coalesce(b.months, 1)))::date)::timestamptz
   from public.listing_requests b
   where b.listing_id = p.id and b.status in ('moved_in', 'completed')
     and (b.move_in + make_interval(months => coalesce(b.months, 1)))::date <= current_date),
  p.published_at)
where p.status = 'approved' and p.available_since is null;

alter table public.properties enable trigger properties_guard;
alter table public.properties enable trigger properties_timeline;

-- Reserved and rented places: rented with an end date while a stay runs, otherwise back in the search.
-- (Runs with the triggers on: the change goes through the owner_action path, like a real booking.)
do $$
declare
  place record;
begin
  for place in select id from public.properties where status in ('reserved', 'rented') loop
    perform public.refresh_listing_occupancy(place.id);
  end loop;
end;
$$;
