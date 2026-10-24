-- Sakani as the trusted middleman.
-- Students contact the Sakani team (never the owner directly); the team checks with the real owner,
-- arranges the visit and, when the home is rented, a service fee is due from BOTH sides:
-- the owner's success fee (existing) and the student's service fee (new).
-- Rent and deposit still go straight from student to owner; Sakani only collects its own fees.
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1) Owner phone numbers are private: only the owner and admins can read them
-- ---------------------------------------------------------------------------
-- (Hiding the column from visitors is done in 20261030010000_sakani_private_numbers.sql, after the
-- site stops reading it.)

-- The number for listings you own (or any listing, for admins).
create or replace function public.listing_private_contacts(listing_ids uuid[])
returns table (listing_id uuid, whatsapp_number text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.whatsapp_number
  from public.properties p
  where p.id = any (listing_ids)
    and (p.owner_id = (select auth.uid()) or public.is_admin());
$$;

revoke all on function public.listing_private_contacts(uuid[]) from public, anon;
grant execute on function public.listing_private_contacts(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Settings: the team's WhatsApp number and the student service fee
-- ---------------------------------------------------------------------------
alter table public.app_settings add column if not exists team_whatsapp text not null default '' check (char_length(team_whatsapp) <= 20);
alter table public.app_settings add column if not exists student_fee_percent numeric(5, 2) not null default 10 check (student_fee_percent >= 0 and student_fee_percent <= 100);
alter table public.app_settings add column if not exists student_fee_minimum integer not null default 200 check (student_fee_minimum >= 0 and student_fee_minimum <= 100000);

update public.app_settings set team_whatsapp = '01068387231' where id = 1 and team_whatsapp = '';

grant update (team_whatsapp, student_fee_percent, student_fee_minimum) on public.app_settings to authenticated;

create or replace function public.student_fee_for(rent integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(s.student_fee_minimum, round(rent * s.student_fee_percent / 100)::integer)
  from public.app_settings s
  where s.id = 1;
$$;

grant execute on function public.student_fee_for(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Visit requests from students, handled by the team
-- ---------------------------------------------------------------------------
create table if not exists public.listing_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.properties (id) on delete set null,
  listing_title text not null check (char_length(listing_title) <= 160),
  name text not null check (char_length(name) between 2 and 80),
  contact text not null check (char_length(contact) between 8 and 40),
  preferred_time text check (preferred_time is null or char_length(preferred_time) <= 80),
  note text check (note is null or char_length(note) <= 1000),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  status text not null default 'new' check (status in ('new', 'contacted', 'visit', 'rented', 'closed')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_requests_status_created_idx on public.listing_requests (status, created_at desc);
create index if not exists listing_requests_listing_idx on public.listing_requests (listing_id);

alter table public.listing_requests enable row level security;

grant insert on public.listing_requests to anon, authenticated;
grant select, update, delete on public.listing_requests to authenticated;

drop policy if exists "Anyone can request a visit" on public.listing_requests;
create policy "Anyone can request a visit"
  on public.listing_requests for insert to anon, authenticated
  with check (
    status = 'new'
    and admin_note is null
    and exists (select 1 from public.properties p where p.id = listing_id and p.status = 'approved')
  );

drop policy if exists "Admins can read requests" on public.listing_requests;
create policy "Admins can read requests"
  on public.listing_requests for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can update requests" on public.listing_requests;
create policy "Admins can update requests"
  on public.listing_requests for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete requests" on public.listing_requests;
create policy "Admins can delete requests"
  on public.listing_requests for delete to authenticated
  using ((select public.is_admin()));

-- Flood guard (at most 30 requests per minute site-wide) and timestamps.
create or replace function public.listing_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from public.listing_requests where created_at > now() - interval '1 minute') >= 30 then
      raise exception 'request_limit' using errcode = 'P0001';
    end if;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists listing_requests_guard on public.listing_requests;
create trigger listing_requests_guard
  before insert or update on public.listing_requests
  for each row execute function public.listing_requests_guard();

-- ---------------------------------------------------------------------------
-- 4) Fees from both sides
-- ---------------------------------------------------------------------------
alter table public.rental_fees add column if not exists payer text not null default 'owner' check (payer in ('owner', 'student'));
alter table public.rental_fees add column if not exists request_id uuid references public.listing_requests (id) on delete set null;
alter table public.rental_fees add column if not exists payer_name text check (payer_name is null or char_length(payer_name) <= 80);
alter table public.rental_fees add column if not exists payer_contact text check (payer_contact is null or char_length(payer_contact) <= 40);

create index if not exists rental_fees_request_idx on public.rental_fees (request_id);

-- Owners see only their own owner fees (student fees are kept for admins).
drop policy if exists "Owners and admins can read fees" on public.rental_fees;
create policy "Owners and admins can read fees"
  on public.rental_fees for select to authenticated
  using (((select auth.uid()) = owner_id and payer = 'owner') or (select public.is_admin()));

-- Owners can only send payment details for their own owner fees.
create or replace function public.owner_submit_payment(target_fee uuid, pay_method text, pay_reference text, pay_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pay_method not in ('instapay', 'vodafone_cash') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(pay_reference, ''))) not between 3 and 64 then
    raise exception 'invalid_reference' using errcode = 'P0001';
  end if;
  if coalesce(pay_phone, '') !~ '^[+0-9 ()-]{8,20}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  update public.rental_fees
  set status = 'submitted',
      method = pay_method,
      reference = trim(pay_reference),
      payer_phone = trim(pay_phone),
      submitted_at = now()
  where id = target_fee
    and owner_id = (select auth.uid())
    and payer = 'owner'
    and status = 'due';

  if not found then
    raise exception 'fee_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Admin closes a request as rented: the listing is hidden and both fees are created (once).
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
    insert into public.rental_fees (listing_id, owner_id, listing_title, monthly_price, amount, payer, request_id, payer_name, payer_contact, created_by_admin)
    values (listing.id, listing.owner_id, listing.title_en, listing.monthly_price, student_fee, 'student', target_request, req.name, req.contact, true);
  end if;

  return jsonb_build_object('owner_fee', owner_fee, 'student_fee', student_fee);
end;
$$;

revoke all on function public.admin_close_request(uuid) from public, anon;
grant execute on function public.admin_close_request(uuid) to authenticated;
