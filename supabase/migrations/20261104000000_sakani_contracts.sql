-- Sakani phase 2 — contracts and documents:
--   1) contract_acceptances: who accepted which document, which version, and when
--   2) accept_document: platform agreements (guest / host) and the booking's rental agreement;
--      once both the guest and the host accept the rental agreement, the booking's contract is signed
--      (so the deposit can be transferred — see admin_transfer_deposit)
--   3) booking_document_data: everything the booking's documents show, for its guest, host or an admin
-- Acceptance here is a recorded agreement, not a certified electronic signature.
-- Run once in the Supabase SQL Editor, after 20261103010000_sakani_booking_deposit_fix.sql. Safe to run again.

create table if not exists public.contract_acceptances (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.listing_requests (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  party text not null check (party in ('guest', 'host')),
  document text not null check (document in ('guest_platform', 'host_platform', 'rental_agreement')),
  document_version text not null check (char_length(document_version) between 1 and 40),
  accepted_at timestamptz not null default now()
);

create unique index if not exists contract_acceptances_once_idx
  on public.contract_acceptances (user_id, document, document_version, booking_id) nulls not distinct;
create index if not exists contract_acceptances_booking_idx on public.contract_acceptances (booking_id);

alter table public.contract_acceptances enable row level security;
revoke all on public.contract_acceptances from anon, authenticated;
grant select on public.contract_acceptances to authenticated;

drop policy if exists "Parties and admins read acceptances" on public.contract_acceptances;
create policy "Parties and admins read acceptances"
  on public.contract_acceptances for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin())
    or exists (
      select 1 from public.listing_requests b
      where b.id = booking_id and (b.guest_id = (select auth.uid()) or b.host_id = (select auth.uid()))
    )
  );

drop trigger if exists audit_contract_acceptances on public.contract_acceptances;
create trigger audit_contract_acceptances after insert or update or delete on public.contract_acceptances
  for each row execute function public.audit_row_change();

-- Accept a document. Platform agreements need no booking; the rental agreement is per booking,
-- open once the booking is confirmed, and signs the contract when both sides have accepted the same version.
create or replace function public.accept_document(target_booking uuid, doc text, doc_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  b record;
  my_party text;
  both_sides boolean := false;
begin
  if me is null then
    raise exception 'account_required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(doc_version, ''))) not between 1 and 40 then
    raise exception 'invalid_version' using errcode = 'P0001';
  end if;

  -- Platform agreements need a real account; the rental agreement only needs to be the booking's guest or host
  -- (hosts who list without an account have an anonymous session).
  if doc in ('guest_platform', 'host_platform') then
    if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
      raise exception 'account_required' using errcode = '42501';
    end if;
    insert into public.contract_acceptances (booking_id, user_id, party, document, document_version)
    values (null, me, case when doc = 'guest_platform' then 'guest' else 'host' end, doc, trim(doc_version))
    on conflict do nothing;
    return jsonb_build_object('accepted', true);
  end if;

  if doc <> 'rental_agreement' then
    raise exception 'invalid_document' using errcode = 'P0001';
  end if;

  select * into b from public.listing_requests where id = target_booking for update;
  if b.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  my_party := case when b.guest_id = me then 'guest' when b.host_id = me then 'host' end;
  if my_party is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if b.status not in ('confirmed', 'moved_in', 'completed') then
    raise exception 'booking_not_confirmed' using errcode = 'P0001';
  end if;

  insert into public.contract_acceptances (booking_id, user_id, party, document, document_version)
  values (b.id, me, my_party, 'rental_agreement', trim(doc_version))
  on conflict do nothing;

  select count(distinct party) = 2 into both_sides
  from public.contract_acceptances
  where booking_id = b.id and document = 'rental_agreement' and document_version = trim(doc_version);

  if both_sides and b.contract_signed_at is null then
    update public.listing_requests set contract_signed_at = now() where id = b.id;
  end if;
  return jsonb_build_object('accepted', true, 'contract_signed', both_sides);
end;
$$;

revoke all on function public.accept_document(uuid, text, text) from public, anon;
grant execute on function public.accept_document(uuid, text, text) to authenticated;

-- Everything a booking's documents show. Only the booking's guest, its host, or an admin can read it.
create or replace function public.booking_document_data(target_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  b record;
  listing record;
  fee record;
  deposit record;
  guest_name text;
  host_name text;
  viewer text;
begin
  select * into b from public.listing_requests where id = target_booking;
  if b.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  viewer := case when b.guest_id = me then 'guest' when b.host_id = me then 'host' when public.is_admin() then 'admin' end;
  if viewer is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select title_ar, title_en, governorate, area, property_type, gender into listing from public.properties where id = b.listing_id;
  select id, status, method, reference, submitted_at, decided_at into fee from public.rental_fees where id = b.fee_id;
  select status, amount, transfer_reference, transferred_at, acknowledged_at, refund_reference, refunded_at into deposit
  from public.deposit_transfers where booking_id = b.id;
  select full_name into guest_name from public.profiles where id = b.guest_id;
  select full_name into host_name from public.profiles where id = b.host_id;

  return jsonb_build_object(
    'viewer', viewer,
    'booking', jsonb_build_object(
      'id', b.id, 'status', b.status, 'created_at', b.created_at, 'move_in', b.move_in, 'months', b.months, 'guests', b.guests,
      'listing_id', b.listing_id, 'listing_title', b.listing_title, 'host_decision', b.host_decision,
      'rent_amount', b.rent_amount, 'guest_fee', b.guest_fee, 'host_fee', b.host_fee, 'deposit_amount', b.deposit_amount,
      'total_amount', b.total_amount, 'payout_amount', b.payout_amount, 'guest_fee_percent', b.guest_fee_percent, 'host_fee_percent', b.host_fee_percent,
      'paid_at', b.paid_at, 'moved_in_at', b.moved_in_at, 'contract_signed_at', b.contract_signed_at,
      'problem_note', b.problem_note, 'problem_at', b.problem_at, 'refund_reference', b.refund_reference, 'refunded_at', b.refunded_at,
      'payout_reference', b.payout_reference, 'paid_out_at', b.paid_out_at
    ),
    'listing', case when listing is null then null else jsonb_build_object(
      'title_ar', listing.title_ar, 'title_en', listing.title_en, 'governorate', listing.governorate, 'area', listing.area,
      'property_type', listing.property_type, 'gender', listing.gender) end,
    'guest_name', coalesce(nullif(guest_name, ''), b.name),
    'host_name', coalesce(host_name, ''),
    'payment', case when fee.id is null then null else jsonb_build_object(
      'id', fee.id, 'status', fee.status, 'method', fee.method, 'reference', fee.reference, 'submitted_at', fee.submitted_at, 'decided_at', fee.decided_at) end,
    'deposit', case when deposit.status is null then null else jsonb_build_object(
      'status', deposit.status, 'amount', deposit.amount, 'transfer_reference', deposit.transfer_reference, 'transferred_at', deposit.transferred_at,
      'acknowledged_at', deposit.acknowledged_at, 'refund_reference', deposit.refund_reference, 'refunded_at', deposit.refunded_at) end,
    'acceptances', coalesce((
      select jsonb_agg(jsonb_build_object('party', a.party, 'document', a.document, 'version', a.document_version, 'accepted_at', a.accepted_at) order by a.accepted_at)
      from public.contract_acceptances a
      where a.booking_id = b.id
         or (a.booking_id is null and ((a.user_id = b.guest_id and a.document = 'guest_platform') or (a.user_id = b.host_id and a.document = 'host_platform')))
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.booking_document_data(uuid) from public, anon;
grant execute on function public.booking_document_data(uuid) to authenticated;
