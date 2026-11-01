-- Sakani phase 1 — money:
--   1) one commission formula (integer arithmetic, half-up to the pound), shared with lib/finance.ts
--   2) the security deposit is part of the upfront payment and never earns commission
--   3) each booking keeps the commission rates it was made with
--   4) deposit ledger: transfer to the host only after payment and a signed contract, once, with host acknowledgement
--   5) audit log of every money change (nobody can edit or delete it) and booking status history
-- Run once in the Supabase SQL Editor, after 20261102000000_sakani_upfront_chat.sql. Safe to run again.

-- ---------------------------------------------------------------------------
-- 1) Commission formula: round(amount × percent / 100), half-up, in whole pounds, no floating point.
-- ---------------------------------------------------------------------------
create or replace function public.commission_for(amount integer, percent numeric)
returns integer
language sql
immutable
set search_path = ''
as $$
  select ((amount::bigint * round(percent * 100)::bigint + 5000) / 10000)::integer;
$$;

grant execute on function public.commission_for(integer, numeric) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2–3) Deposit in the upfront payment; rates kept on the booking
-- ---------------------------------------------------------------------------
alter table public.listing_requests add column if not exists deposit_amount integer not null default 0 check (deposit_amount >= 0);
alter table public.listing_requests add column if not exists guest_fee_percent numeric(5, 2);
alter table public.listing_requests add column if not exists host_fee_percent numeric(5, 2);
-- Set by the contract step (phase 2); the deposit can't be transferred before it.
alter table public.listing_requests add column if not exists contract_signed_at timestamptz;
alter table public.rental_fees add column if not exists deposit_amount integer not null default 0 check (deposit_amount >= 0);

create or replace function public.guest_create_booking(target_listing uuid, move_in_date date, stay_months integer, people integer, guest_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  who record;
  listing record;
  settings record;
  rent integer;
  v_deposit integer;
  g_pct numeric;
  h_pct numeric;
  g_fee integer;
  h_fee integer;
  total integer;
  fee_row record;
  booking uuid;
  thread uuid;
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'account_required' using errcode = '42501';
  end if;
  if move_in_date is null or move_in_date < current_date then
    raise exception 'invalid_move_in' using errcode = 'P0001';
  end if;
  if stay_months is null or stay_months not between 1 and 24 or coalesce(people, 1) not between 1 and 10 then
    raise exception 'invalid_stay' using errcode = 'P0001';
  end if;
  if (select count(*) from public.listing_requests where guest_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'request_limit' using errcode = 'P0001';
  end if;

  select id, owner_id, title_en, title_ar, monthly_price, deposit as listing_deposit, is_demo, status into listing
  from public.properties where id = target_listing;
  if listing.id is null or listing.status <> 'approved' then
    raise exception 'listing_not_available' using errcode = 'P0002';
  end if;
  if listing.is_demo then
    raise exception 'demo_listing' using errcode = 'P0001';
  end if;
  if listing.owner_id = me then
    raise exception 'own_listing' using errcode = 'P0001';
  end if;

  select full_name, phone into who from public.profiles where id = me;
  if coalesce(who.phone, '') = '' then
    raise exception 'phone_required' using errcode = 'P0001';
  end if;

  -- Commissions are on the first month's rent only; the deposit earns none.
  select * into settings from public.app_settings where id = 1;
  g_pct := coalesce(settings.student_fee_percent, 8);
  h_pct := coalesce(settings.fee_percent, 10);
  rent := listing.monthly_price;
  v_deposit := coalesce(listing.listing_deposit, 0);
  g_fee := public.commission_for(rent, g_pct);
  h_fee := public.commission_for(rent, h_pct);
  total := rent + g_fee + v_deposit;

  insert into public.rental_fees (listing_id, owner_id, listing_title, monthly_price, amount, payer, kind, rent_amount, fee_amount, deposit_amount, payer_name, payer_contact, guest_id)
  values (listing.id, listing.owner_id, listing.title_en, rent, total, 'student', 'upfront', rent, g_fee, v_deposit, left(coalesce(nullif(who.full_name, ''), 'Guest'), 80), who.phone, me)
  returning id, pay_token into fee_row;

  insert into public.listing_requests (listing_id, listing_title, name, contact, note, locale, status, guest_id, host_id, fee_id,
    move_in, months, guests, rent_amount, guest_fee, host_fee, deposit_amount, total_amount, payout_amount, guest_fee_percent, host_fee_percent)
  values (listing.id, left(listing.title_en, 160), left(coalesce(nullif(who.full_name, ''), 'Guest'), 80), who.phone,
    nullif(left(trim(coalesce(guest_note, '')), 1000), ''), 'ar', 'pending_payment', me, listing.owner_id, fee_row.id,
    move_in_date, stay_months, coalesce(people, 1), rent, g_fee, h_fee, v_deposit, total, rent - h_fee, g_pct, h_pct)
  returning id into booking;

  update public.rental_fees set request_id = booking where id = fee_row.id;

  insert into public.support_threads (user_id) values (me) on conflict (user_id) do nothing;
  select id into thread from public.support_threads where user_id = me;
  insert into public.support_messages (thread_id, sender_id, from_team, body, booking_id, listing_id)
  values (thread, me, false, 'طلب حجز جديد / New booking: ' || listing.title_ar || ' — ' || move_in_date || ' — ' || stay_months || ' mo', booking, listing.id);

  return jsonb_build_object('booking_id', booking, 'pay_token', fee_row.pay_token, 'total', total, 'rent', rent, 'fee', g_fee, 'deposit', v_deposit);
end;
$$;

-- The payment page shows the deposit too.
drop function if exists public.fee_by_token(uuid);
create or replace function public.fee_by_token(token uuid)
returns table (
  amount integer,
  status text,
  payer text,
  kind text,
  rent_amount integer,
  fee_amount integer,
  deposit_amount integer,
  listing_id uuid,
  listing_title text,
  monthly_price integer,
  method text,
  submitted_at timestamptz,
  decided_at timestamptz,
  admin_note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.amount, f.status, f.payer, f.kind, f.rent_amount, f.fee_amount, f.deposit_amount, f.listing_id, f.listing_title, f.monthly_price,
         f.method, f.submitted_at, f.decided_at, f.admin_note
  from public.rental_fees f
  where f.pay_token = token;
$$;

revoke all on function public.fee_by_token(uuid) from public;
grant execute on function public.fee_by_token(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4) Deposit ledger
-- ---------------------------------------------------------------------------
create table if not exists public.deposit_transfers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.listing_requests (id) on delete cascade,
  host_id uuid references auth.users (id) on delete set null,
  amount integer not null check (amount > 0),
  status text not null default 'transferred' check (status in ('transferred', 'acknowledged', 'refund_pending', 'refunded', 'disputed')),
  transfer_reference text not null check (char_length(transfer_reference) between 3 and 64),
  transferred_at timestamptz not null default now(),
  transferred_by uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz,
  refund_reference text check (refund_reference is null or char_length(refund_reference) <= 64),
  refunded_at timestamptz,
  dispute_note text check (dispute_note is null or char_length(dispute_note) <= 1000),
  updated_at timestamptz not null default now()
);

create index if not exists deposit_transfers_host_idx on public.deposit_transfers (host_id);
create index if not exists deposit_transfers_transferred_by_idx on public.deposit_transfers (transferred_by);

alter table public.deposit_transfers enable row level security;
revoke all on public.deposit_transfers from anon, authenticated;
grant select on public.deposit_transfers to authenticated;

drop policy if exists "Hosts and admins read deposit transfers" on public.deposit_transfers;
create policy "Hosts and admins read deposit transfers"
  on public.deposit_transfers for select to authenticated
  using (host_id = (select auth.uid()) or (select public.is_admin()));

-- Admin: send the deposit to the host — only after the payment is confirmed and the contract signed, and only once.
create or replace function public.admin_transfer_deposit(target_booking uuid, transfer_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  fee_status text;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(transfer_reference, ''))) not between 3 and 64 then
    raise exception 'invalid_reference' using errcode = 'P0001';
  end if;
  select * into b from public.listing_requests where id = target_booking for update;
  if b.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  select status into fee_status from public.rental_fees where id = b.fee_id;
  if fee_status is distinct from 'paid' or b.status not in ('confirmed', 'moved_in', 'completed') then
    raise exception 'payment_not_confirmed' using errcode = 'P0001';
  end if;
  if b.contract_signed_at is null then
    raise exception 'contract_not_signed' using errcode = 'P0001';
  end if;
  if coalesce(b.deposit_amount, 0) <= 0 then
    raise exception 'no_deposit' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.deposit_transfers where booking_id = b.id) then
    raise exception 'already_transferred' using errcode = 'P0001';
  end if;
  insert into public.deposit_transfers (booking_id, host_id, amount, transfer_reference, transferred_by)
  values (b.id, b.host_id, b.deposit_amount, trim(transfer_reference), (select auth.uid()));
end;
$$;

-- Host: I received the deposit (and am responsible for returning it under the rental agreement).
create or replace function public.host_acknowledge_deposit(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.deposit_transfers set status = 'acknowledged', acknowledged_at = now(), updated_at = now()
  where booking_id = target_booking and host_id = (select auth.uid()) and status = 'transferred';
  if not found then
    raise exception 'deposit_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Admin: record what happened to the deposit at the end (returned to the guest, or a dispute).
create or replace function public.admin_update_deposit(target_booking uuid, new_status text, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if new_status not in ('refund_pending', 'refunded', 'disputed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(note, ''))) not between 3 and 1000 then
    raise exception 'invalid_note' using errcode = 'P0001';
  end if;
  update public.deposit_transfers
  set status = new_status,
      refund_reference = case when new_status = 'refunded' then left(trim(note), 64) else refund_reference end,
      refunded_at = case when new_status = 'refunded' then now() else refunded_at end,
      dispute_note = case when new_status = 'disputed' then trim(note) else dispute_note end,
      updated_at = now()
  where booking_id = target_booking;
  if not found then
    raise exception 'deposit_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_transfer_deposit(uuid, text) from public, anon;
revoke all on function public.host_acknowledge_deposit(uuid) from public, anon;
revoke all on function public.admin_update_deposit(uuid, text, text) from public, anon;
grant execute on function public.admin_transfer_deposit(uuid, text) to authenticated;
grant execute on function public.host_acknowledge_deposit(uuid) to authenticated;
grant execute on function public.admin_update_deposit(uuid, text, text) to authenticated;

-- Hosts see the deposit of their bookings and whether it was sent.
drop function if exists public.host_bookings();
create or replace function public.host_bookings()
returns table (
  id uuid, listing_id uuid, listing_title text, guest_first_name text, move_in date, months integer, guests integer,
  status text, host_decision text, rent_amount integer, host_fee integer, payout_amount integer, paid_out_at timestamptz,
  deposit_amount integer, deposit_status text, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.listing_id, b.listing_title, split_part(b.name, ' ', 1), b.move_in, b.months, b.guests,
         b.status, b.host_decision, b.rent_amount, b.host_fee, b.payout_amount, b.paid_out_at,
         b.deposit_amount, d.status, b.created_at
  from public.listing_requests b
  left join public.deposit_transfers d on d.booking_id = b.id
  where b.host_id = (select auth.uid()) and b.status <> 'cancelled'
  order by b.created_at desc
  limit 200;
$$;

revoke all on function public.host_bookings() from public, anon;
grant execute on function public.host_bookings() to authenticated;

-- ---------------------------------------------------------------------------
-- 5) Audit log (append-only) and booking status history
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  entity text not null,
  entity_id text,
  action text not null,
  old_data jsonb,
  new_data jsonb
);

create index if not exists audit_logs_entity_idx on public.audit_logs (entity, entity_id, at desc);
create index if not exists audit_logs_at_idx on public.audit_logs (at desc);

alter table public.audit_logs enable row level security;
revoke all on public.audit_logs from anon, authenticated;
grant select on public.audit_logs to authenticated;

drop policy if exists "Admins read the audit log" on public.audit_logs;
create policy "Admins read the audit log"
  on public.audit_logs for select to authenticated
  using ((select public.is_admin()));

-- Nobody, admins included, can change or remove an audit entry through the site.
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log_is_append_only' using errcode = '42501';
end;
$$;

drop trigger if exists audit_logs_immutable on public.audit_logs;
create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor, entity, entity_id, action, old_data, new_data)
  values (
    (select auth.uid()),
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id', ''),
    lower(tg_op),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_rental_fees on public.rental_fees;
create trigger audit_rental_fees after insert or update or delete on public.rental_fees
  for each row execute function public.audit_row_change();
drop trigger if exists audit_deposit_transfers on public.deposit_transfers;
create trigger audit_deposit_transfers after insert or update or delete on public.deposit_transfers
  for each row execute function public.audit_row_change();
drop trigger if exists audit_app_settings on public.app_settings;
create trigger audit_app_settings after update on public.app_settings
  for each row execute function public.audit_row_change();
drop trigger if exists audit_listing_requests on public.listing_requests;
create trigger audit_listing_requests after update or delete on public.listing_requests
  for each row execute function public.audit_row_change();

create table if not exists public.booking_status_history (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.listing_requests (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid,
  at timestamptz not null default now()
);

create index if not exists booking_status_history_booking_idx on public.booking_status_history (booking_id, at);

alter table public.booking_status_history enable row level security;
revoke all on public.booking_status_history from anon, authenticated;
grant select on public.booking_status_history to authenticated;

drop policy if exists "Guests, hosts and admins read booking history" on public.booking_status_history;
create policy "Guests, hosts and admins read booking history"
  on public.booking_status_history for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.listing_requests b
      where b.id = booking_id and (b.guest_id = (select auth.uid()) or b.host_id = (select auth.uid()))
    )
  );

create or replace function public.track_booking_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.booking_status_history (booking_id, from_status, to_status, changed_by)
    values (new.id, case when tg_op = 'INSERT' then null else old.status end, new.status, (select auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists track_booking_status on public.listing_requests;
create trigger track_booking_status after insert or update on public.listing_requests
  for each row execute function public.track_booking_status();
