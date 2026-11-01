-- Sakani: reviews after a stay, availability (no double bookings), admin roles, and error reports.
-- Safe to run more than once. Run it before deploying the code that uses it.

-- ---------------------------------------------------------------------------
-- 1) Availability: a booking must start on or after "available from", and a place can't be
--    booked twice for the same months (rooms and beds: up to their free beds).
-- ---------------------------------------------------------------------------
create index if not exists listing_requests_listing_status_idx on public.listing_requests (listing_id, status);

create or replace function public.booking_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  place record;
  taken integer;
begin
  if new.listing_id is null or new.move_in is null then
    return new;
  end if;
  select available_from, property_type, available_beds into place from public.properties where id = new.listing_id;
  if place.available_from is not null and new.move_in < place.available_from then
    raise exception 'not_available_yet' using errcode = 'P0001';
  end if;
  select count(*) into taken
  from public.listing_requests b
  where b.listing_id = new.listing_id
    and b.id <> new.id
    and b.status in ('pending_payment', 'payment_review', 'confirmed', 'moved_in', 'cancellation_requested')
    and daterange(b.move_in, (b.move_in + make_interval(months => coalesce(b.months, 1)))::date)
        && daterange(new.move_in, (new.move_in + make_interval(months => coalesce(new.months, 1)))::date);
  if taken >= case when place.property_type in ('room', 'bed') then greatest(coalesce(place.available_beds, 1), 1) else 1 end then
    raise exception 'dates_taken' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_availability on public.listing_requests;
create trigger booking_availability before insert on public.listing_requests
  for each row execute function public.booking_availability();

-- The months already taken on a place, for its calendar. Dates only: nothing about who booked.
create or replace function public.listing_booked_ranges(target_listing uuid)
returns table (starts date, ends date)
language sql
stable
security definer
set search_path = ''
as $$
  select b.move_in, (b.move_in + make_interval(months => coalesce(b.months, 1)))::date
  from public.listing_requests b
  join public.properties p on p.id = b.listing_id
  where b.listing_id = target_listing
    and p.status in ('approved', 'reserved', 'rented')
    and b.status in ('payment_review', 'confirmed', 'moved_in', 'cancellation_requested')
    and (b.move_in + make_interval(months => coalesce(b.months, 1)))::date >= current_date
  order by b.move_in
  limit 24;
$$;

revoke all on function public.listing_booked_ranges(uuid) from public;
grant execute on function public.listing_booked_ranges(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Reviews: the guest rates the place after moving in (once per booking).
-- ---------------------------------------------------------------------------
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.listing_requests (id) on delete cascade,
  listing_id uuid references public.properties (id) on delete set null,
  host_id uuid references auth.users (id) on delete set null,
  guest_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1000),
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists reviews_listing_idx on public.reviews (listing_id, created_at desc) where not hidden;
create index if not exists reviews_guest_idx on public.reviews (guest_id);
create index if not exists reviews_host_idx on public.reviews (host_id);

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select, update (hidden) on public.reviews to authenticated;

drop policy if exists "Guests read their reviews, admins read all" on public.reviews;
create policy "Guests read their reviews, admins read all"
  on public.reviews for select to authenticated
  using (guest_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Admins hide reviews" on public.reviews;
create policy "Admins hide reviews"
  on public.reviews for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create or replace function public.guest_review_booking(target_booking uuid, stars integer, review_text text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking record;
  created uuid;
begin
  select id, listing_id, host_id, guest_id, status into booking from public.listing_requests where id = target_booking;
  if booking.id is null or booking.guest_id is distinct from (select auth.uid()) then
    raise exception 'not_your_booking' using errcode = '42501';
  end if;
  if booking.status not in ('moved_in', 'completed') then
    raise exception 'not_moved_in' using errcode = 'P0001';
  end if;
  if stars is null or stars < 1 or stars > 5 then
    raise exception 'bad_rating' using errcode = 'P0001';
  end if;
  insert into public.reviews (booking_id, listing_id, host_id, guest_id, rating, body)
  values (booking.id, booking.listing_id, booking.host_id, booking.guest_id, stars, left(trim(coalesce(review_text, '')), 1000))
  on conflict (booking_id) do nothing
  returning id into created;
  if created is null then
    raise exception 'already_reviewed' using errcode = 'P0001';
  end if;
  if booking.host_id is not null then
    perform public.notify_user(booking.host_id, 'new_review', booking.id, jsonb_build_object('rating', stars));
  end if;
  return created;
end;
$$;

revoke all on function public.guest_review_booking(uuid, integer, text) from public, anon;
grant execute on function public.guest_review_booking(uuid, integer, text) to authenticated;

-- Public reviews of a place: the guest's first name only.
create or replace function public.listing_reviews(target_listing uuid)
returns table (rating smallint, body text, guest_first_name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.rating, r.body, nullif(split_part(coalesce(pr.full_name, ''), ' ', 1), ''), r.created_at
  from public.reviews r
  left join public.profiles pr on pr.id = r.guest_id
  where r.listing_id = target_listing and not r.hidden
  order by r.created_at desc
  limit 50;
$$;

-- Average and count for several places at once (cards).
create or replace function public.listing_ratings(listing_ids uuid[])
returns table (listing_id uuid, average numeric, reviews integer)
language sql
stable
security definer
set search_path = ''
as $$
  select r.listing_id, round(avg(r.rating)::numeric, 1), count(*)::integer
  from public.reviews r
  where r.listing_id = any(listing_ids) and not r.hidden
  group by r.listing_id;
$$;

revoke all on function public.listing_reviews(uuid) from public;
revoke all on function public.listing_ratings(uuid[]) from public;
grant execute on function public.listing_reviews(uuid) to anon, authenticated;
grant execute on function public.listing_ratings(uuid[]) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Admin roles: "full" admins do everything; "reviewer" admins review listings, chat and
--    reports, but can't touch money, policies or the team.
-- ---------------------------------------------------------------------------
alter table public.admin_users add column if not exists role text not null default 'full';
alter table public.admin_users drop constraint if exists admin_users_role_check;
alter table public.admin_users add constraint admin_users_role_check check (role in ('full', 'reviewer'));

create or replace function public.is_full_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()) and role = 'full');
$$;

revoke all on function public.is_full_admin() from public;
grant execute on function public.is_full_admin() to anon, authenticated;

-- Refuses money and policy changes made by a reviewer admin, however they are made.
create or replace function public.block_reviewer_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.admin_users where user_id = (select auth.uid()) and role = 'reviewer') then
    raise exception 'reviewer_not_allowed' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

do $$
declare
  target text;
begin
  foreach target in array array['rental_fees', 'listing_requests', 'deposit_transfers', 'app_settings', 'cancellation_rules', 'cancellation_requests', 'legal_pages']
  loop
    if to_regclass('public.' || target) is not null then
      execute format('drop trigger if exists block_reviewer_admin on public.%I', target);
      execute format('create trigger block_reviewer_admin before insert or update or delete on public.%I for each row execute function public.block_reviewer_admin()', target);
    end if;
  end loop;
end;
$$;

-- The team list now includes each admin's role (the return type changes, so drop it first).
drop function if exists public.admin_team();
create function public.admin_team()
returns table (user_id uuid, email text, added_at timestamptz, last_sign_in_at timestamptz, email_confirmed boolean, role text)
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
    select a.user_id, u.email::text, a.created_at, u.last_sign_in_at, u.email_confirmed_at is not null, a.role
    from public.admin_users a
    join auth.users u on u.id = a.user_id
    order by a.created_at;
end;
$$;

-- Only full admins manage the team.
create or replace function public.admin_team_add(target_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
begin
  if not public.is_full_admin() then
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
  insert into public.admin_users (user_id) values (target_id) on conflict (user_id) do nothing;
  return case when found then 'added' else 'already_admin' end;
end;
$$;

create or replace function public.admin_team_remove(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_full_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if target_user_id = (select auth.uid()) then
    return 'cannot_remove_self';
  end if;
  delete from public.admin_users where user_id = target_user_id;
  return case when found then 'removed' else 'not_admin_member' end;
end;
$$;

create or replace function public.admin_team_set_role(target_user_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_full_admin() then
    raise exception 'not_admin' using errcode = '42501';
  end if;
  if target_user_id = (select auth.uid()) then
    raise exception 'cannot_change_self' using errcode = 'P0001';
  end if;
  if new_role not in ('full', 'reviewer') then
    raise exception 'bad_role' using errcode = 'P0001';
  end if;
  update public.admin_users set role = new_role where user_id = target_user_id;
end;
$$;

revoke all on function public.admin_team() from public, anon;
revoke all on function public.admin_team_add(text) from public, anon;
revoke all on function public.admin_team_remove(uuid) from public, anon;
revoke all on function public.admin_team_set_role(uuid, text) from public, anon;
grant execute on function public.admin_team() to authenticated;
grant execute on function public.admin_team_add(text) to authenticated;
grant execute on function public.admin_team_remove(uuid) to authenticated;
grant execute on function public.admin_team_set_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Error reports from visitors' browsers, so the team hears about problems first.
-- ---------------------------------------------------------------------------
create table if not exists public.client_errors (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  page text not null check (char_length(page) <= 300),
  message text not null check (char_length(message) <= 500),
  detail text not null default '' check (char_length(detail) <= 2000),
  user_agent text not null default '' check (char_length(user_agent) <= 300)
);

create index if not exists client_errors_at_idx on public.client_errors (at desc);

alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;
grant select, delete on public.client_errors to authenticated;

drop policy if exists "Admins read error reports" on public.client_errors;
create policy "Admins read error reports"
  on public.client_errors for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins clear error reports" on public.client_errors;
create policy "Admins clear error reports"
  on public.client_errors for delete to authenticated
  using ((select public.is_admin()));

-- Repeats of the same message within 10 minutes are dropped, and at most 500 reports a day are kept.
create or replace function public.report_client_error(error_page text, error_message text, error_detail text, agent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.client_errors where message = left(error_message, 500) and at > now() - interval '10 minutes') then
    return;
  end if;
  if (select count(*) from public.client_errors where at > now() - interval '1 day') >= 500 then
    return;
  end if;
  insert into public.client_errors (user_id, page, message, detail, user_agent)
  values ((select auth.uid()), left(coalesce(error_page, ''), 300), left(coalesce(error_message, ''), 500), left(coalesce(error_detail, ''), 2000), left(coalesce(agent, ''), 300));
end;
$$;

revoke all on function public.report_client_error(text, text, text, text) from public;
grant execute on function public.report_client_error(text, text, text, text) to anon, authenticated;
