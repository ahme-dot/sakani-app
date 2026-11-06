-- Sakani card payments (Visa, Mastercard, Meeza) through Paymob.
--   - payment_mode 'paymob': the payment page sends the guest to Paymob's checkout; the card is typed there,
--     never on Sakani. The payment is confirmed only by Paymob's signed message to the server.
--   - The card fee (a percent + a fixed amount, set by admins) is added to what the guest pays.
--   - Refunds go back to the same card; host payouts stay manual.
--   - The functions that mark a payment paid or refunded can only be called by the server (service role).
-- Run after 20261109000000_sakani_security_fixes.sql. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- 1) Settings
-- ---------------------------------------------------------------------------
alter table public.app_settings drop constraint if exists app_settings_payment_mode_check;
alter table public.app_settings add constraint app_settings_payment_mode_check check (payment_mode in ('manual', 'sandbox', 'paymob'));
alter table public.app_settings add column if not exists card_fee_percent numeric(5, 2) not null default 2.75 check (card_fee_percent between 0 and 10);
alter table public.app_settings add column if not exists card_fee_fixed integer not null default 3 check (card_fee_fixed between 0 and 100);

-- The policy switches were never writable by admins (only by the SQL Editor); now they are.
-- The admin-only update policy and the reviewer block still apply.
grant update (payment_mode, cancellation_policy_active, cancellation_policy_note, card_fee_percent, card_fee_fixed) on public.app_settings to authenticated;

-- The card fee on an amount, in whole pounds, rounded up (the same formula as lib/payments.ts).
create or replace function public.card_fee_for(base integer)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(base, 0) <= 0 then 0
    else ceil(base * s.card_fee_percent / 100.0 + s.card_fee_fixed)::integer end
  from public.app_settings s where s.id = 1;
$$;

revoke all on function public.card_fee_for(integer) from public;
grant execute on function public.card_fee_for(integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2) Fees: card payments
-- ---------------------------------------------------------------------------
alter table public.rental_fees drop constraint if exists rental_fees_method_check;
alter table public.rental_fees add constraint rental_fees_method_check check (method in ('instapay', 'vodafone_cash', 'card'));
alter table public.rental_fees add column if not exists card_fee integer not null default 0 check (card_fee >= 0);
alter table public.rental_fees add column if not exists gateway_txn_id text;
alter table public.rental_fees add column if not exists gateway_refund_id text;
alter table public.rental_fees add column if not exists paid_amount integer;

-- One row per checkout attempt (Paymob refuses a reference it has seen before, and a guest may open the
-- checkout twice: whichever attempt is paid counts). Private: no grants to users.
create table if not exists public.payment_attempts (
  reference text primary key,
  fee_id uuid not null references public.rental_fees (id) on delete cascade,
  amount integer not null,
  card_fee integer not null,
  created_at timestamptz not null default now()
);
create index if not exists payment_attempts_fee_idx on public.payment_attempts (fee_id);
alter table public.payment_attempts enable row level security;
revoke all on public.payment_attempts from anon, authenticated;
create unique index if not exists rental_fees_gateway_txn_idx on public.rental_fees (gateway_txn_id) where gateway_txn_id is not null;

-- The payment page: the card fee is shown before paying (worked out now) and kept once paid.
drop function if exists public.fee_by_token(uuid);
create function public.fee_by_token(token uuid)
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
  admin_note text,
  card_fee integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.amount, f.status, f.payer, f.kind, f.rent_amount, f.fee_amount, f.deposit_amount, f.listing_id, f.listing_title, f.monthly_price,
         f.method, f.submitted_at, f.decided_at, f.admin_note,
         case when f.status = 'due' then public.card_fee_for(f.amount) else f.card_fee end
  from public.rental_fees f
  where f.pay_token = token;
$$;

revoke all on function public.fee_by_token(uuid) from public;
grant execute on function public.fee_by_token(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Server-only steps (service role). Nobody signed in can call them.
-- ---------------------------------------------------------------------------
-- Start a checkout: fixes the card fee and a new reference for this attempt.
create or replace function public.gateway_begin(token uuid)
returns table (fee_id uuid, reference text, amount integer, card_fee integer, total integer, payer_name text, payer_contact text, listing_title text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.rental_fees;
  fee integer;
  ref text;
begin
  if (select payment_mode from public.app_settings where id = 1) <> 'paymob' then
    raise exception 'card_disabled' using errcode = '42501';
  end if;
  select * into f from public.rental_fees where pay_token = token for update;
  if f.id is null then
    raise exception 'fee_not_found' using errcode = 'P0002';
  end if;
  if f.status <> 'due' then
    raise exception 'fee_not_due' using errcode = 'P0001';
  end if;
  if (select count(*) from public.payment_attempts a where a.fee_id = f.id and a.created_at > now() - interval '1 hour') >= 10 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;
  fee := public.card_fee_for(f.amount);
  ref :=f.id::text || '-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
  insert into public.payment_attempts (reference, fee_id, amount, card_fee) values (ref, f.id, f.amount, fee);
  return query select f.id, ref, f.amount, fee, f.amount + fee, f.payer_name, f.payer_contact, f.listing_title;
end;
$$;

-- Paymob's signed message (checked by the server first): marks the fee paid if the amount is exactly right.
-- Returns what happened, for the server's log: paid, duplicate, double, failed, mismatch, unknown.
create or replace function public.gateway_mark_paid(attempt_ref text, txn_id text, amount_cents bigint, succeeded boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.payment_attempts;
  f public.rental_fees;
  booking public.listing_requests;
begin
  select * into attempt from public.payment_attempts a where a.reference = attempt_ref;
  if attempt.reference is null then
    return 'unknown';
  end if;
  select * into f from public.rental_fees where id = attempt.fee_id for update;
  if f.gateway_txn_id = txn_id then
    return 'duplicate';
  end if;
  if not succeeded then
    update public.rental_fees set admin_note = 'Card payment failed or was declined (Paymob ' || left(txn_id, 40) || ')' where id = f.id and status = 'due';
    return 'failed';
  end if;
  if f.status in ('paid', 'refunded') then
    -- A second successful payment for the same fee (two checkouts paid): it must be refunded by hand in Paymob.
    update public.rental_fees set admin_note = left('Paid twice by card: refund Paymob transaction ' || txn_id || ' in the Paymob dashboard.', 500) where id = f.id;
    return 'double';
  end if;
  if amount_cents <> (attempt.amount + attempt.card_fee)::bigint * 100 then
    update public.rental_fees set admin_note = 'Card amount does not match: ' || amount_cents || ' piasters (Paymob ' || left(txn_id, 40) || '). Check and refund.'
    where id = f.id;
    return 'mismatch';
  end if;
  update public.rental_fees
  set status = 'paid', method = 'card', reference = left('PAYMOB-' || txn_id, 64), gateway_txn_id = txn_id,
      card_fee = attempt.card_fee, paid_amount = attempt.amount + attempt.card_fee, decided_at = now(), submitted_at = coalesce(submitted_at, now()),
      admin_note = 'Paid by card (Paymob)'
  where id = f.id;
  -- Paid after the booking expired: the money goes back.
  select * into booking from public.listing_requests where fee_id = f.id;
  if booking.id is not null and booking.status = 'cancelled' then
    update public.listing_requests set status = 'refund_pending', refund_due_at = now() + interval '24 hours',
      problem_note = coalesce(problem_note, 'Paid by card after the booking had expired.')
    where id = booking.id;
  end if;
  return 'paid';
end;
$$;

-- What to refund to the card for a booking waiting for its refund.
-- A full refund (host declined or didn't answer, a problem before moving in) includes the card fee;
-- an approved cancellation refunds what the policy allows.
create or replace function public.gateway_refund_info(target_booking uuid)
returns table (txn_id text, amount_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b public.listing_requests;
  f public.rental_fees;
  allowed integer;
begin
  select * into b from public.listing_requests where id = target_booking;
  if b.id is null or b.status <> 'refund_pending' then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  select * into f from public.rental_fees where id = b.fee_id;
  if f.id is null or f.method <> 'card' or f.gateway_txn_id is null or f.status <> 'paid' then
    raise exception 'not_card' using errcode = 'P0001';
  end if;
  select c.refundable_amount into allowed from public.cancellation_requests c
  where c.booking_id = b.id and c.status = 'approved' order by c.created_at desc limit 1;
  allowed := coalesce(allowed, f.amount + f.card_fee);
  allowed := least(allowed, coalesce(f.paid_amount, f.amount + f.card_fee));
  if allowed <= 0 then
    raise exception 'nothing_to_refund' using errcode = 'P0001';
  end if;
  return query select f.gateway_txn_id, allowed::bigint * 100;
end;
$$;

-- After Paymob accepted the refund: the booking and the fee are closed as refunded.
create or replace function public.gateway_mark_refunded(target_booking uuid, refund_txn text, admin_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ref text := left('PAYMOB-' || refund_txn, 64);
begin
  update public.listing_requests set status = 'refunded', refund_reference = ref, refunded_at = now()
  where id = target_booking and status = 'refund_pending';
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  update public.rental_fees set status = 'refunded', gateway_refund_id = refund_txn, decided_at = now(), decided_by = admin_user
  where id = (select fee_id from public.listing_requests where id = target_booking);
  update public.cancellation_requests set status = 'refunded', refund_reference = ref
  where booking_id = target_booking and status = 'approved';
end;
$$;

revoke all on function public.gateway_begin(uuid) from public, anon, authenticated;
revoke all on function public.gateway_mark_paid(text, text, bigint, boolean) from public, anon, authenticated;
revoke all on function public.gateway_refund_info(uuid) from public, anon, authenticated;
revoke all on function public.gateway_mark_refunded(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.gateway_begin(uuid) to service_role;
grant execute on function public.gateway_mark_paid(text, text, bigint, boolean) to service_role;
grant execute on function public.gateway_refund_info(uuid) to service_role;
grant execute on function public.gateway_mark_refunded(uuid, text, uuid) to service_role;

-- A card payment can't also be marked refunded by hand with a made-up number: card refunds go through Paymob.
create or replace function public.admin_mark_refunded(target_booking uuid, transfer_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(transfer_reference, ''))) not between 3 and 64 then
    raise exception 'invalid_reference' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.listing_requests b join public.rental_fees f on f.id = b.fee_id
    where b.id = target_booking and f.method = 'card' and f.gateway_txn_id is not null
  ) then
    raise exception 'refund_by_card' using errcode = 'P0001';
  end if;
  update public.listing_requests set status = 'refunded', refund_reference = trim(transfer_reference), refunded_at = now()
  where id = target_booking and status = 'refund_pending';
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  update public.rental_fees set status = 'refunded', decided_at = now(), decided_by = (select auth.uid())
  where id = (select fee_id from public.listing_requests where id = target_booking);
  update public.cancellation_requests set status = 'refunded', refund_reference = trim(transfer_reference)
  where booking_id = target_booking and status = 'approved';
end;
$$;
