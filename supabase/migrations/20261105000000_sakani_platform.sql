-- Sakani phases 3–8:
--   A) cancellation policy (7 scenarios, configured by admins, inactive until legally approved) and cancellation requests
--   B) more listing details (bedrooms, bathrooms, area, minimum stay, available from) and statuses reserved / rented / suspended
--   C) in-app notifications
--   D) support tickets (on top of the chat with the Sakani team)
--   E) admin finance summary
--   F) identity documents (private storage, reviewed by admins)
--   G) editable legal pages
--   H) payment mode: manual InstaPay or sandbox
-- Run once in the Supabase SQL Editor, after 20261104000000_sakani_contracts.sql. Safe to run again.

-- ---------------------------------------------------------------------------
-- H) Payment mode and cancellation policy switch
-- ---------------------------------------------------------------------------
alter table public.app_settings add column if not exists payment_mode text not null default 'manual';
alter table public.app_settings drop constraint if exists app_settings_payment_mode_check;
alter table public.app_settings add constraint app_settings_payment_mode_check check (payment_mode in ('manual', 'sandbox'));
alter table public.app_settings add column if not exists cancellation_policy_active boolean not null default false;
alter table public.app_settings add column if not exists cancellation_policy_note text not null default '' check (char_length(cancellation_policy_note) <= 500);

-- Sandbox only: settle a payment link as paid or failed without real money (for testing the flow).
create or replace function public.sandbox_settle_payment(token uuid, succeed boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select payment_mode from public.app_settings where id = 1) <> 'sandbox' then
    raise exception 'sandbox_disabled' using errcode = '42501';
  end if;
  update public.rental_fees
  set status = case when succeed then 'paid' else 'due' end,
      method = 'instapay',
      reference = case when succeed then 'SANDBOX-' || left(replace(gen_random_uuid()::text, '-', ''), 10) else reference end,
      admin_note = case when succeed then 'Sandbox payment (no real money)' else 'Sandbox: payment failed' end,
      decided_at = now()
  where pay_token = token and status in ('due', 'submitted');
  if not found then
    raise exception 'fee_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.sandbox_settle_payment(uuid, boolean) from public;
grant execute on function public.sandbox_settle_payment(uuid, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- A) Cancellation policy and requests
-- ---------------------------------------------------------------------------
create table if not exists public.cancellation_rules (
  scenario text primary key check (scenario in ('host_cancels', 'guest_before_contract', 'guest_after_contract', 'property_unavailable', 'inaccurate_listing', 'platform_failure', 'mutual')),
  -- Null means "not decided yet": a request in that scenario can't be approved.
  refund_rent_percent integer check (refund_rent_percent between 0 and 100),
  refund_guest_fee boolean,
  refund_deposit boolean,
  notes text not null default '' check (char_length(notes) <= 500),
  updated_at timestamptz not null default now()
);

insert into public.cancellation_rules (scenario) values
  ('host_cancels'), ('guest_before_contract'), ('guest_after_contract'), ('property_unavailable'),
  ('inaccurate_listing'), ('platform_failure'), ('mutual')
on conflict (scenario) do nothing;

alter table public.cancellation_rules enable row level security;
revoke all on public.cancellation_rules from anon, authenticated;
grant select on public.cancellation_rules to anon, authenticated;
grant update on public.cancellation_rules to authenticated;

drop policy if exists "Anyone reads the cancellation rules" on public.cancellation_rules;
create policy "Anyone reads the cancellation rules" on public.cancellation_rules for select using (true);
drop policy if exists "Admins edit the cancellation rules" on public.cancellation_rules;
create policy "Admins edit the cancellation rules" on public.cancellation_rules for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop trigger if exists audit_cancellation_rules on public.cancellation_rules;
create trigger audit_cancellation_rules after update on public.cancellation_rules
  for each row execute function public.audit_row_change();

alter table public.listing_requests drop constraint if exists listing_requests_status_check;
alter table public.listing_requests add constraint listing_requests_status_check
  check (status in ('pending_payment', 'payment_review', 'confirmed', 'moved_in', 'completed', 'cancellation_requested', 'refund_pending', 'refunded', 'cancelled'));
alter table public.listing_requests add column if not exists status_before_cancellation text;

create table if not exists public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.listing_requests (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  requesting_party text not null check (requesting_party in ('guest', 'host', 'admin')),
  scenario text not null references public.cancellation_rules (scenario),
  reason text not null check (char_length(reason) between 5 and 1000),
  amount_paid integer not null default 0,
  refundable_amount integer,
  commission_treatment text,
  deposit_treatment text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'refunded')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  refund_reference text check (refund_reference is null or char_length(refund_reference) <= 64),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null
);

create index if not exists cancellation_requests_booking_idx on public.cancellation_requests (booking_id, created_at desc);
create index if not exists cancellation_requests_status_idx on public.cancellation_requests (status, created_at desc);
create index if not exists cancellation_requests_requested_by_idx on public.cancellation_requests (requested_by);
create index if not exists cancellation_requests_decided_by_idx on public.cancellation_requests (decided_by);
create index if not exists cancellation_requests_scenario_idx on public.cancellation_requests (scenario);

alter table public.cancellation_requests enable row level security;
revoke all on public.cancellation_requests from anon, authenticated;
grant select on public.cancellation_requests to authenticated;

drop policy if exists "Parties and admins read cancellation requests" on public.cancellation_requests;
create policy "Parties and admins read cancellation requests" on public.cancellation_requests for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.listing_requests b where b.id = booking_id and (b.guest_id = (select auth.uid()) or b.host_id = (select auth.uid())))
  );

drop trigger if exists audit_cancellation_requests on public.cancellation_requests;
create trigger audit_cancellation_requests after insert or update or delete on public.cancellation_requests
  for each row execute function public.audit_row_change();

-- The guest or the host asks to cancel; the booking waits for the team's decision.
create or replace function public.request_cancellation(target_booking uuid, cancel_scenario text, cancel_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  b record;
  party text;
  request uuid;
begin
  select * into b from public.listing_requests where id = target_booking for update;
  if b.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  party := case when b.guest_id = me then 'guest' when b.host_id = me then 'host' when public.is_admin() then 'admin' end;
  if party is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.cancellation_rules where scenario = cancel_scenario) then
    raise exception 'invalid_scenario' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(cancel_reason, ''))) not between 5 and 1000 then
    raise exception 'invalid_reason' using errcode = 'P0001';
  end if;
  if b.status not in ('payment_review', 'confirmed', 'moved_in') then
    raise exception 'cannot_cancel_now' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.cancellation_requests where booking_id = b.id and status = 'pending') then
    raise exception 'already_requested' using errcode = 'P0001';
  end if;

  insert into public.cancellation_requests (booking_id, requested_by, requesting_party, scenario, reason, amount_paid)
  values (b.id, me, party, cancel_scenario, trim(cancel_reason), coalesce(b.total_amount, 0))
  returning id into request;

  update public.listing_requests
  set status = 'cancellation_requested', status_before_cancellation = b.status, problem_note = trim(cancel_reason), problem_at = now()
  where id = b.id;
  return request;
end;
$$;

-- The guest's "There's a problem" now opens a cancellation request (scenario chosen by the team on review).
create or replace function public.guest_report_problem(target_booking uuid, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.listing_requests where id = target_booking and guest_id = (select auth.uid())) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  perform public.request_cancellation(
    target_booking,
    case when (select contract_signed_at from public.listing_requests where id = target_booking) is null then 'guest_before_contract' else 'guest_after_contract' end,
    note
  );
end;
$$;

-- Admin decides. Approval needs the policy switched on and a rule for the scenario; it works out the refund from the rule.
create or replace function public.admin_decide_cancellation(target_request uuid, approve boolean, chosen_scenario text, note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  b record;
  rule record;
  deposit_sent boolean;
  refund integer;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into r from public.cancellation_requests where id = target_request for update;
  if r.id is null or r.status <> 'pending' then
    raise exception 'request_not_found' using errcode = 'P0002';
  end if;
  select * into b from public.listing_requests where id = r.booking_id for update;

  if not approve then
    update public.cancellation_requests set status = 'rejected', admin_note = nullif(trim(coalesce(note, '')), ''), decided_at = now(), decided_by = (select auth.uid())
    where id = r.id;
    update public.listing_requests set status = coalesce(status_before_cancellation, 'confirmed'), status_before_cancellation = null where id = b.id;
    return jsonb_build_object('status', 'rejected');
  end if;

  if not coalesce((select cancellation_policy_active from public.app_settings where id = 1), false) then
    raise exception 'policy_not_active' using errcode = 'P0001';
  end if;
  select * into rule from public.cancellation_rules where scenario = coalesce(nullif(chosen_scenario, ''), r.scenario);
  if rule.scenario is null or rule.refund_rent_percent is null or rule.refund_guest_fee is null or rule.refund_deposit is null then
    raise exception 'rule_not_set' using errcode = 'P0001';
  end if;

  deposit_sent := exists (select 1 from public.deposit_transfers where booking_id = b.id);
  refund := public.commission_for(coalesce(b.rent_amount, 0), rule.refund_rent_percent)
    + case when rule.refund_guest_fee then coalesce(b.guest_fee, 0) else 0 end
    + case when rule.refund_deposit and not deposit_sent then coalesce(b.deposit_amount, 0) else 0 end;

  update public.cancellation_requests
  set status = 'approved', scenario = rule.scenario, refundable_amount = refund,
      commission_treatment = case when rule.refund_guest_fee then 'guest_fee_refunded' else 'guest_fee_kept' end,
      deposit_treatment = case when not rule.refund_deposit then 'deposit_kept' when deposit_sent then 'host_returns_deposit' else 'deposit_refunded' end,
      admin_note = nullif(trim(coalesce(note, '')), ''), decided_at = now(), decided_by = (select auth.uid())
  where id = r.id;
  update public.listing_requests set status = 'refund_pending', refund_due_at = now() + interval '24 hours' where id = b.id;
  return jsonb_build_object('status', 'approved', 'refundable_amount', refund);
end;
$$;

-- When the team records the refund, the approved request is closed with the same reference.
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

revoke all on function public.request_cancellation(uuid, text, text) from public, anon;
revoke all on function public.guest_report_problem(uuid, text) from public, anon;
revoke all on function public.admin_decide_cancellation(uuid, boolean, text, text) from public, anon;
revoke all on function public.admin_mark_refunded(uuid, text) from public, anon;
grant execute on function public.request_cancellation(uuid, text, text) to authenticated;
grant execute on function public.guest_report_problem(uuid, text) to authenticated;
grant execute on function public.admin_decide_cancellation(uuid, boolean, text, text) to authenticated;
grant execute on function public.admin_mark_refunded(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- B) Listing details and statuses
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists bedrooms smallint check (bedrooms is null or bedrooms between 0 and 20);
alter table public.properties add column if not exists bathrooms smallint check (bathrooms is null or bathrooms between 0 and 20);
alter table public.properties add column if not exists area_sqm integer check (area_sqm is null or area_sqm between 5 and 2000);
alter table public.properties add column if not exists min_months smallint not null default 1 check (min_months between 1 and 24);
alter table public.properties add column if not exists available_from date;

alter table public.properties drop constraint if exists properties_status_check;
alter table public.properties add constraint properties_status_check
  check (status in ('pending', 'approved', 'rejected', 'paused', 'reserved', 'rented', 'suspended'));

-- Every column except the owner's number stays readable (see 20261030010000_sakani_private_numbers.sql).
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

-- A booking can't be shorter than the place's minimum stay.
create or replace function public.booking_min_stay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.months is not null and new.months < coalesce((select min_months from public.properties where id = new.listing_id), 1) then
    raise exception 'stay_too_short' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_min_stay on public.listing_requests;
create trigger booking_min_stay before insert on public.listing_requests
  for each row execute function public.booking_min_stay();

-- A confirmed booking reserves the place; moving in marks it rented.
create or replace function public.booking_listing_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and new.listing_id is not null then
    perform set_config('sakani.owner_action', 'on', true);
    if new.status = 'confirmed' then
      update public.properties set status = 'reserved' where id = new.listing_id and status in ('approved', 'paused');
    elsif new.status = 'moved_in' then
      update public.properties set status = 'rented' where id = new.listing_id and status in ('approved', 'paused', 'reserved');
    end if;
    perform set_config('sakani.owner_action', 'off', true);
  end if;
  return new;
end;
$$;

drop trigger if exists booking_listing_status on public.listing_requests;
create trigger booking_listing_status after update on public.listing_requests
  for each row execute function public.booking_listing_status();

-- Admin: suspend a listing (or lift the suspension back to published).
create or replace function public.admin_suspend_listing(target_listing uuid, suspend boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.properties set status = case when suspend then 'suspended' else 'approved' end
  where id = target_listing and status = case when suspend then status else 'suspended' end;
  if not found then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_suspend_listing(uuid, boolean) from public, anon;
grant execute on function public.admin_suspend_listing(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- C) Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (char_length(kind) <= 40),
  booking_id uuid references public.listing_requests (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_booking_idx on public.notifications (booking_id);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select, update (read_at) on public.notifications to authenticated;

drop policy if exists "Users read their notifications" on public.notifications;
create policy "Users read their notifications" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Users mark their notifications read" on public.notifications;
create policy "Users mark their notifications read" on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create or replace function public.notify_user(target_user uuid, notice_kind text, target_booking uuid, notice_data jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, booking_id, data)
  select target_user, notice_kind, target_booking, coalesce(notice_data, '{}'::jsonb)
  where target_user is not null;
$$;

revoke all on function public.notify_user(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- Booking events notify the guest and the host.
create or replace function public.notify_booking_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  info jsonb := jsonb_build_object('title', new.listing_title);
begin
  if tg_op = 'INSERT' then
    perform public.notify_user(new.host_id, 'booking_new', new.id, info);
    return new;
  end if;
  if new.host_decision is distinct from old.host_decision and new.host_decision in ('accepted', 'declined') then
    perform public.notify_user(new.guest_id, 'booking_' || new.host_decision, new.id, info);
  end if;
  if new.status is distinct from old.status then
    if new.status = 'confirmed' then
      perform public.notify_user(new.guest_id, 'booking_confirmed', new.id, info);
      perform public.notify_user(new.host_id, 'booking_confirmed', new.id, info);
      perform public.notify_user(new.guest_id, 'agreement_ready', new.id, info);
      perform public.notify_user(new.host_id, 'agreement_ready', new.id, info);
    elsif new.status = 'cancellation_requested' then
      perform public.notify_user(new.guest_id, 'cancellation_requested', new.id, info);
      perform public.notify_user(new.host_id, 'cancellation_requested', new.id, info);
    elsif new.status = 'refunded' then
      perform public.notify_user(new.guest_id, 'refund_done', new.id, info);
    elsif new.status = 'cancelled' then
      perform public.notify_user(new.guest_id, 'booking_cancelled', new.id, info);
    elsif new.status = 'completed' then
      perform public.notify_user(new.host_id, 'payout_sent', new.id, info);
    end if;
  end if;
  if new.contract_signed_at is not null and old.contract_signed_at is null then
    perform public.notify_user(new.guest_id, 'agreement_signed', new.id, info);
    perform public.notify_user(new.host_id, 'agreement_signed', new.id, info);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_booking_events on public.listing_requests;
create trigger notify_booking_events after insert or update on public.listing_requests
  for each row execute function public.notify_booking_events();

create or replace function public.notify_payment_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'upfront' and new.status is distinct from old.status then
    if new.status = 'paid' then
      perform public.notify_user(new.guest_id, 'payment_received', new.request_id, jsonb_build_object('title', new.listing_title, 'amount', new.amount));
    elsif new.status = 'due' and old.status = 'submitted' then
      perform public.notify_user(new.guest_id, 'payment_failed', new.request_id, jsonb_build_object('title', new.listing_title, 'amount', new.amount));
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notify_payment_events on public.rental_fees;
create trigger notify_payment_events after update on public.rental_fees
  for each row execute function public.notify_payment_events();

create or replace function public.notify_deposit_events()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.notify_user(new.host_id, 'deposit_transferred', new.booking_id, jsonb_build_object('amount', new.amount));
  end if;
  return new;
end;
$$;

drop trigger if exists notify_deposit_events on public.deposit_transfers;
create trigger notify_deposit_events after insert on public.deposit_transfers
  for each row execute function public.notify_deposit_events();

-- A team reply in the chat notifies the user.
create or replace function public.notify_team_reply()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.from_team then
    perform public.notify_user((select user_id from public.support_threads where id = new.thread_id), 'team_reply', new.booking_id, '{}'::jsonb);
  end if;
  return new;
end;
$$;

drop trigger if exists notify_team_reply on public.support_messages;
create trigger notify_team_reply after insert on public.support_messages
  for each row execute function public.notify_team_reply();

-- ---------------------------------------------------------------------------
-- D) Support tickets
-- ---------------------------------------------------------------------------
create sequence if not exists public.support_ticket_number_seq start 1001;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  number integer not null unique default nextval('public.support_ticket_number_seq'),
  user_id uuid not null references auth.users (id) on delete cascade,
  category text not null check (category in ('booking', 'payment', 'refund', 'property', 'other')),
  subject text not null check (char_length(subject) between 3 and 120),
  booking_id uuid references public.listing_requests (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter sequence public.support_ticket_number_seq owned by public.support_tickets.number;

create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets (status, created_at desc);
create index if not exists support_tickets_booking_idx on public.support_tickets (booking_id);

alter table public.support_messages add column if not exists ticket_id uuid references public.support_tickets (id) on delete set null;
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id);

alter table public.support_tickets enable row level security;
revoke all on public.support_tickets from anon, authenticated;
grant select on public.support_tickets to authenticated;
grant update (status, updated_at) on public.support_tickets to authenticated;

drop policy if exists "Users and admins read tickets" on public.support_tickets;
create policy "Users and admins read tickets" on public.support_tickets for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "Admins update tickets" on public.support_tickets;
create policy "Admins update tickets" on public.support_tickets for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

create or replace function public.create_support_ticket(ticket_category text, ticket_subject text, first_message text, target_booking uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  thread uuid;
  ticket record;
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'account_required' using errcode = '42501';
  end if;
  if target_booking is not null and not exists (
    select 1 from public.listing_requests where id = target_booking and (guest_id = me or host_id = me)
  ) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.support_tickets where user_id = me and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'ticket_limit' using errcode = 'P0001';
  end if;
  insert into public.support_tickets (user_id, category, subject, booking_id)
  values (me, ticket_category, trim(ticket_subject), target_booking)
  returning id, number into ticket;
  insert into public.support_threads (user_id) values (me) on conflict (user_id) do nothing;
  select id into thread from public.support_threads where user_id = me;
  insert into public.support_messages (thread_id, sender_id, from_team, body, booking_id, ticket_id)
  values (thread, me, false, '#' || ticket.number || ' — ' || trim(first_message), target_booking, ticket.id);
  return jsonb_build_object('id', ticket.id, 'number', ticket.number);
end;
$$;

revoke all on function public.create_support_ticket(text, text, text, uuid) from public, anon;
grant execute on function public.create_support_ticket(text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- E) Admin finance summary (booking value is not revenue; deposits are not revenue)
-- ---------------------------------------------------------------------------
create or replace function public.admin_finance_summary(from_date date, to_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  with paid as (
    select b.* from public.listing_requests b
    join public.rental_fees f on f.id = b.fee_id
    where f.status = 'paid' and b.created_at::date between from_date and to_date
  ), scope as (
    select * from public.listing_requests where created_at::date between from_date and to_date
  )
  select jsonb_build_object(
    'booking_value', coalesce((select sum(total_amount) from paid), 0),
    'rent_value', coalesce((select sum(rent_amount) from paid), 0),
    'guest_commissions', coalesce((select sum(guest_fee) from paid), 0),
    'host_commissions', coalesce((select sum(host_fee) from paid), 0),
    'platform_commissions', coalesce((select sum(coalesce(guest_fee, 0) + coalesce(host_fee, 0)) from paid), 0),
    'deposits_held', coalesce((select sum(deposit_amount) from paid p where not exists (select 1 from public.deposit_transfers d where d.booking_id = p.id)), 0),
    'deposits_awaiting_transfer', coalesce((select count(*) from paid p where p.deposit_amount > 0 and p.contract_signed_at is not null and not exists (select 1 from public.deposit_transfers d where d.booking_id = p.id)), 0),
    'deposits_transferred', coalesce((select sum(amount) from public.deposit_transfers d join scope s on s.id = d.booking_id), 0),
    'pending_payments', (select count(*) from scope where status in ('pending_payment', 'payment_review')),
    'refund_requests', (select count(*) from public.cancellation_requests c join scope s on s.id = c.booking_id where c.status in ('pending', 'approved')),
    'refunded_value', coalesce((select sum(total_amount) from scope where status = 'refunded'), 0),
    'completed_bookings', (select count(*) from scope where status = 'completed'),
    'cancelled_bookings', (select count(*) from scope where status in ('cancelled', 'refunded')),
    'all_bookings', (select count(*) from scope)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_finance_summary(date, date) from public, anon;
grant execute on function public.admin_finance_summary(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- F) Identity documents (private)
-- ---------------------------------------------------------------------------
create table if not exists public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_path text not null check (char_length(file_path) <= 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  admin_note text check (admin_note is null or char_length(admin_note) <= 500),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null
);

create index if not exists identity_verifications_user_idx on public.identity_verifications (user_id, created_at desc);
create index if not exists identity_verifications_status_idx on public.identity_verifications (status, created_at);
create index if not exists identity_verifications_reviewed_by_idx on public.identity_verifications (reviewed_by);

alter table public.identity_verifications enable row level security;
revoke all on public.identity_verifications from anon, authenticated;
grant select, insert on public.identity_verifications to authenticated;

drop policy if exists "Users and admins read identity checks" on public.identity_verifications;
create policy "Users and admins read identity checks" on public.identity_verifications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "Users submit their identity document" on public.identity_verifications;
create policy "Users submit their identity document" on public.identity_verifications for insert to authenticated
  with check (user_id = (select auth.uid()) and status = 'pending' and admin_note is null and reviewed_at is null
    and file_path like (select auth.uid())::text || '/%');

create or replace function public.admin_review_identity(target_check uuid, approve boolean, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.identity_verifications
  set status = case when approve then 'approved' else 'rejected' end, admin_note = nullif(trim(coalesce(note, '')), ''),
      reviewed_at = now(), reviewed_by = (select auth.uid())
  where id = target_check and status = 'pending'
  returning user_id into person;
  if person is null then
    raise exception 'check_not_found' using errcode = 'P0002';
  end if;
  update public.profiles set id_verified = approve where id = person;
  perform public.notify_user(person, case when approve then 'identity_approved' else 'identity_rejected' end, null, '{}'::jsonb);
end;
$$;

revoke all on function public.admin_review_identity(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_identity(uuid, boolean, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sakani-identity', 'sakani-identity', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users upload their identity document" on storage.objects;
create policy "Users upload their identity document" on storage.objects for insert to authenticated
  with check (bucket_id = 'sakani-identity' and (storage.foldername(name))[1] = (select auth.uid())::text
    and not coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false));

drop policy if exists "Owners and admins read identity documents" on storage.objects;
create policy "Owners and admins read identity documents" on storage.objects for select to authenticated
  using (bucket_id = 'sakani-identity' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())));

-- ---------------------------------------------------------------------------
-- G) Editable legal pages (drafts until marked approved)
-- ---------------------------------------------------------------------------
create table if not exists public.legal_pages (
  slug text not null check (slug in ('cancellation-policy', 'refund-policy', 'deposit-policy', 'commission-disclosure', 'host-responsibilities', 'guest-responsibilities')),
  locale text not null check (locale in ('ar', 'en')),
  title text not null check (char_length(title) between 3 and 120),
  body text not null check (char_length(body) between 10 and 20000),
  approved boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (slug, locale)
);

create index if not exists legal_pages_updated_by_idx on public.legal_pages (updated_by);

alter table public.legal_pages enable row level security;
revoke all on public.legal_pages from anon, authenticated;
grant select on public.legal_pages to anon, authenticated;
grant insert, update on public.legal_pages to authenticated;

drop policy if exists "Anyone reads legal pages" on public.legal_pages;
create policy "Anyone reads legal pages" on public.legal_pages for select using (true);
drop policy if exists "Admins write legal pages" on public.legal_pages;
create policy "Admins write legal pages" on public.legal_pages for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

drop trigger if exists audit_legal_pages on public.legal_pages;
create trigger audit_legal_pages after insert or update on public.legal_pages
  for each row execute function public.audit_row_change();
