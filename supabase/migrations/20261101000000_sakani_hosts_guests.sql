-- Sakani as a host–guest marketplace:
--   1) profiles with a role (host or guest), created at sign-up
--   2) saved homes stored in the account
--   3) bookings: signed-in guests book (move-in date, months); they see and cancel their own
--   4) guests see their own service fees (and pay them by link)
--   5) homes are for men or women only ("mixed" listings go back to their owners)
--   6) universities are no longer required
-- Run once in the Supabase SQL Editor, after 20261031000000_sakani_pay_links.sql.

-- ---------------------------------------------------------------------------
-- 1) Profiles
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'guest' check (role in ('host', 'guest')),
  full_name text not null default '' check (char_length(full_name) <= 80),
  phone text not null default '' check (phone = '' or phone ~ '^[+0-9 ()-]{8,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;

drop policy if exists "Users read their own profile" on public.profiles;
create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id or (select public.is_admin()));

drop policy if exists "Users update their own profile" on public.profiles;
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.profiles_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.profiles_touch();

-- A profile is made for every real (non-anonymous) account, from the sign-up details.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  clean_phone text := coalesce(meta ->> 'phone', '');
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  if clean_phone !~ '^[+0-9 ()-]{8,20}$' then
    clean_phone := '';
  end if;
  insert into public.profiles (id, role, full_name, phone)
  values (
    new.id,
    case when meta ->> 'role' = 'guest' then 'guest' else 'host' end,
    left(coalesce(meta ->> 'full_name', ''), 80),
    clean_phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Existing accounts were made by owners: they become hosts.
insert into public.profiles (id, role, full_name)
select u.id, 'host', left(coalesce(u.raw_user_meta_data ->> 'full_name', ''), 80)
from auth.users u
where not coalesce(u.is_anonymous, false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2) Saved homes in the account
-- ---------------------------------------------------------------------------
create table if not exists public.saved_listings (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  listing_id uuid not null references public.properties (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index if not exists saved_listings_listing_idx on public.saved_listings (listing_id);

alter table public.saved_listings enable row level security;
grant select, insert, delete on public.saved_listings to authenticated;

drop policy if exists "Users manage their saved homes" on public.saved_listings;
create policy "Users manage their saved homes"
  on public.saved_listings for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3) Bookings (listing_requests now come from signed-in guests)
-- ---------------------------------------------------------------------------
alter table public.listing_requests add column if not exists guest_id uuid default auth.uid() references auth.users (id) on delete set null;
alter table public.listing_requests add column if not exists move_in date;
alter table public.listing_requests add column if not exists months integer check (months is null or months between 1 and 24);
alter table public.listing_requests add column if not exists guests integer not null default 1 check (guests between 1 and 10);

create index if not exists listing_requests_guest_idx on public.listing_requests (guest_id, created_at desc);

revoke insert on public.listing_requests from anon;

drop policy if exists "Anyone can request a visit" on public.listing_requests;
drop policy if exists "Signed-in guests can book" on public.listing_requests;
create policy "Signed-in guests can book"
  on public.listing_requests for insert to authenticated
  with check (
    guest_id = (select auth.uid())
    and coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false
    and status = 'new'
    and admin_note is null
    and move_in is not null
    and move_in >= current_date
    and months is not null
    and exists (select 1 from public.properties p where p.id = listing_id and p.status = 'approved')
  );

drop policy if exists "Admins can read requests" on public.listing_requests;
drop policy if exists "Guests and admins can read bookings" on public.listing_requests;
create policy "Guests and admins can read bookings"
  on public.listing_requests for select to authenticated
  using (guest_id = (select auth.uid()) or (select public.is_admin()));

-- Guests cancel their own booking while the team is still arranging it.
create or replace function public.guest_cancel_booking(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listing_requests
  set status = 'closed'
  where id = target_booking
    and guest_id = (select auth.uid())
    and status in ('new', 'contacted', 'visit');
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.guest_cancel_booking(uuid) from public, anon;
grant execute on function public.guest_cancel_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Guests see their own fees
-- ---------------------------------------------------------------------------
alter table public.rental_fees add column if not exists guest_id uuid references auth.users (id) on delete set null;
create index if not exists rental_fees_guest_idx on public.rental_fees (guest_id);

drop policy if exists "Owners and admins can read fees" on public.rental_fees;
create policy "Owners and admins can read fees"
  on public.rental_fees for select to authenticated
  using (
    ((select auth.uid()) = owner_id and payer = 'owner')
    or ((select auth.uid()) = guest_id and payer = 'student')
    or (select public.is_admin())
  );

-- Confirming a booking: same as before, and the guest's fee is linked to their account.
create or replace function public.admin_close_request(target_request uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  req record;
  listing record;
  owner_fee integer;
  student_fee integer;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select * into req from public.listing_requests where id = target_request;
  if req.id is null then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;

  select id, owner_id, title_en, monthly_price into listing from public.properties where id = req.listing_id;
  if listing.id is null then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;

  update public.listing_requests set status = 'rented' where id = target_request;
  update public.properties set status = 'paused' where id = listing.id and status = 'approved';

  owner_fee := public.success_fee_for(listing.monthly_price);
  student_fee := public.student_fee_for(listing.monthly_price);

  if not exists (select 1 from public.rental_fees where request_id = target_request and payer = 'owner') then
    insert into public.rental_fees (listing_id, owner_id, listing_title, monthly_price, amount, payer, request_id, created_by_admin)
    values (listing.id, listing.owner_id, listing.title_en, listing.monthly_price, owner_fee, 'owner', target_request, true);
  end if;

  if not exists (select 1 from public.rental_fees where request_id = target_request and payer = 'student') then
    insert into public.rental_fees (listing_id, owner_id, listing_title, monthly_price, amount, payer, request_id, payer_name, payer_contact, guest_id, created_by_admin)
    values (listing.id, listing.owner_id, listing.title_en, listing.monthly_price, student_fee, 'student', target_request, req.name, req.contact, req.guest_id, true);
  end if;

  return jsonb_build_object('owner_fee', owner_fee, 'student_fee', student_fee);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Men or women only
-- ---------------------------------------------------------------------------
-- The old rule is dropped first, so this part can be run again safely.
alter table public.properties drop constraint if exists properties_gender_check;

select set_config('sakani.owner_action', 'on', true);
update public.properties
set status = 'rejected',
    rejection_reason = 'Homes are now for men or women only. Edit the listing, choose Men or Women and send it again. / الأماكن دلوقتي للرجالة أو للستات بس. عدّل الإعلان واختار رجالة أو ستات وابعته تاني.'
where gender = 'mixed';
select set_config('sakani.owner_action', 'off', true);

alter table public.properties add constraint properties_gender_check check (gender in ('male', 'female')) not valid;

-- ---------------------------------------------------------------------------
-- 6) Universities are optional
-- ---------------------------------------------------------------------------
alter table public.properties alter column university set default '';
alter table public.properties drop constraint if exists properties_university_length_check;
alter table public.properties
  add constraint properties_university_length_check check (char_length(university) <= 80);
