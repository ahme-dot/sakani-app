-- Sakani: owner success fee, paid by manual InstaPay / Vodafone Cash transfer.
-- Students never pay. Listing is free. When an owner rents a home to a student who found it on Sakani,
-- a one-time fee (a percentage of one month's rent, with a minimum) becomes due.
-- Flow: owner reports the rental -> fee "due" -> owner submits the transfer reference -> "submitted"
--       -> an admin checks the transfer and marks it "paid" (or back to "due", or "waived").
-- Clients never write these tables directly; everything goes through the functions below.

-- ---------------------------------------------------------------------------
-- 1) Payment settings (one row), editable by admins, readable by everyone
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id smallint primary key default 1 check (id = 1),
  payee_name text not null default '' check (char_length(payee_name) <= 80),
  instapay_address text not null default '' check (char_length(instapay_address) <= 80),
  vodafone_cash_number text not null default '' check (char_length(vodafone_cash_number) <= 20),
  fee_percent numeric(5, 2) not null default 20 check (fee_percent >= 0 and fee_percent <= 100),
  fee_minimum integer not null default 150 check (fee_minimum >= 0 and fee_minimum <= 100000),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (id) values (1) on conflict (id) do nothing;

alter table public.app_settings enable row level security;
grant select on public.app_settings to anon, authenticated;
grant update (payee_name, instapay_address, vodafone_cash_number, fee_percent, fee_minimum) on public.app_settings to authenticated;

drop policy if exists "Anyone can read payment settings" on public.app_settings;
create policy "Anyone can read payment settings"
  on public.app_settings for select to anon, authenticated
  using (true);

drop policy if exists "Admins can update payment settings" on public.app_settings;
create policy "Admins can update payment settings"
  on public.app_settings for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create or replace function public.app_settings_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists app_settings_touch on public.app_settings;
create trigger app_settings_touch
  before update on public.app_settings
  for each row execute function public.app_settings_touch();

-- ---------------------------------------------------------------------------
-- 2) Rental fees
-- ---------------------------------------------------------------------------
create table if not exists public.rental_fees (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.properties (id) on delete set null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  listing_title text not null,
  monthly_price integer not null check (monthly_price >= 0),
  amount integer not null check (amount >= 0),
  status text not null default 'due' check (status in ('due', 'submitted', 'paid', 'waived')),
  method text check (method in ('instapay', 'vodafone_cash')),
  reference text check (char_length(reference) <= 64),
  payer_phone text check (char_length(payer_phone) <= 20),
  admin_note text check (char_length(admin_note) <= 500),
  created_by_admin boolean not null default false,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);

create index if not exists rental_fees_owner_idx on public.rental_fees (owner_id);
create index if not exists rental_fees_listing_idx on public.rental_fees (listing_id);
create index if not exists rental_fees_status_idx on public.rental_fees (status, created_at desc);
create index if not exists rental_fees_decided_by_idx on public.rental_fees (decided_by);

alter table public.rental_fees enable row level security;
revoke all on public.rental_fees from anon;
grant select on public.rental_fees to authenticated;

drop policy if exists "Owners and admins can read fees" on public.rental_fees;
create policy "Owners and admins can read fees"
  on public.rental_fees for select to authenticated
  using ((select auth.uid()) = owner_id or (select public.is_admin()));

grant delete on public.rental_fees to authenticated;

drop policy if exists "Admins can delete fees" on public.rental_fees;
create policy "Admins can delete fees"
  on public.rental_fees for delete to authenticated
  using ((select public.is_admin()));

-- The fee for a given monthly rent, from the current settings.
create or replace function public.success_fee_for(rent integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(s.fee_minimum, round(rent * s.fee_percent / 100)::integer)
  from public.app_settings s
  where s.id = 1;
$$;

grant execute on function public.success_fee_for(integer) to anon, authenticated;

-- Owner marks a published (or paused) listing as rented. It is hidden from students; if the student
-- found it on Sakani, a fee becomes due (only one open fee per listing at a time).
create or replace function public.owner_report_rental(target_listing uuid, via_sakani boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing record;
  fee_id uuid;
  fee_amount integer;
begin
  select id, owner_id, status, title_en, monthly_price into listing
  from public.properties
  where id = target_listing and owner_id = (select auth.uid());

  if listing.id is null then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;
  if listing.status not in ('approved', 'paused') then
    raise exception 'listing_status_not_allowed' using errcode = 'P0001';
  end if;

  perform set_config('sakani.owner_action', 'on', true);
  update public.properties set status = 'paused' where id = target_listing;
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

  return jsonb_build_object('status', 'paused', 'fee_id', fee_id, 'amount', fee_amount);
end;
$$;

-- Owner sends the transfer details for a due fee.
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
    and status = 'due';

  if not found then
    raise exception 'fee_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Admin decides: paid (transfer arrived), due (reference not found; owner can resend) or waived.
create or replace function public.admin_decide_fee(target_fee uuid, decision text, note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if decision not in ('paid', 'due', 'waived') then
    raise exception 'invalid_decision' using errcode = 'P0001';
  end if;

  update public.rental_fees
  set status = decision,
      admin_note = nullif(trim(coalesce(note, '')), ''),
      decided_at = now(),
      decided_by = (select auth.uid())
  where id = target_fee;

  if not found then
    raise exception 'fee_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Admin records a rental the owner did not report (e.g. a student told us).
create or replace function public.admin_charge_fee(target_listing uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing record;
  fee_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select id, owner_id, title_en, monthly_price into listing from public.properties where id = target_listing;
  if listing.id is null then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;

  select id into fee_id from public.rental_fees where listing_id = target_listing and status in ('due', 'submitted');
  if fee_id is null then
    insert into public.rental_fees (listing_id, owner_id, listing_title, monthly_price, amount, created_by_admin)
    values (listing.id, listing.owner_id, listing.title_en, listing.monthly_price, public.success_fee_for(listing.monthly_price), true)
    returning id into fee_id;
  end if;
  return fee_id;
end;
$$;

revoke all on function public.owner_report_rental(uuid, boolean) from public, anon;
revoke all on function public.owner_submit_payment(uuid, text, text, text) from public, anon;
revoke all on function public.admin_decide_fee(uuid, text, text) from public, anon;
revoke all on function public.admin_charge_fee(uuid) from public, anon;
grant execute on function public.owner_report_rental(uuid, boolean) to authenticated;
grant execute on function public.owner_submit_payment(uuid, text, text, text) to authenticated;
grant execute on function public.admin_decide_fee(uuid, text, text) to authenticated;
grant execute on function public.admin_charge_fee(uuid) to authenticated;

-- When a guest's listings move to their new account, their fees move too.
create or replace function public.rental_fees_follow_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.rental_fees set owner_id = new.owner_id where listing_id = new.id and owner_id = old.owner_id;
  return new;
end;
$$;

drop trigger if exists rental_fees_follow_owner on public.properties;
create trigger rental_fees_follow_owner
  after update of owner_id on public.properties
  for each row
  when (old.owner_id is distinct from new.owner_id)
  execute function public.rental_fees_follow_owner();

-- ---------------------------------------------------------------------------
-- 3) Guard: owners with a fee more than 14 days overdue cannot add new listings
-- ---------------------------------------------------------------------------
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

    if exists (
      select 1 from public.rental_fees
      where owner_id = new.owner_id
        and status = 'due'
        and created_at < now() - interval '14 days'
    ) then
      raise exception 'unpaid_fee' using errcode = 'P0001',
        hint = 'Pay the overdue success fee before adding new listings.';
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
