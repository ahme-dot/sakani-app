-- Follow-up to 20261108000000 (2026-11-05). Safe to run twice; run it in the Supabase SQL Editor.
--
-- 1) Owners could still write published_at / available_since / rented_until when adding or editing a
--    place: an unset flag reads as NULL, so the check was skipped. Now it can't be.
-- 2) A confirmed booking no longer pauses the place (an older rule in booking_refresh did): it stays in
--    the search until the guest moves in, then shows as rented until the stay ends.

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


create or replace function public.booking_refresh(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  fee_status text;
begin
  select * into b from public.listing_requests where id = target_booking for update;
  if b.id is null or b.status in ('moved_in', 'completed', 'refund_pending', 'refunded', 'cancelled') then
    return;
  end if;
  select status into fee_status from public.rental_fees where id = b.fee_id;

  if fee_status = 'paid' then
    if b.host_decision = 'declined' then
      update public.listing_requests set status = 'refund_pending', refund_due_at = now() + interval '24 hours' where id = b.id;
    elsif b.host_decision = 'accepted' then
      -- Confirmed: the place stays in the search until the guest moves in (see 20261108000000).
      update public.listing_requests set status = 'confirmed', paid_at = coalesce(paid_at, now()) where id = b.id;
    else
      update public.listing_requests set status = 'payment_review', paid_at = coalesce(paid_at, now()) where id = b.id;
    end if;
  elsif fee_status = 'submitted' then
    if b.host_decision = 'declined' then
      update public.listing_requests set status = 'refund_pending', refund_due_at = now() + interval '24 hours' where id = b.id;
    else
      update public.listing_requests set status = 'payment_review' where id = b.id;
    end if;
  else
    if b.host_decision = 'declined' then
      update public.listing_requests set status = 'cancelled' where id = b.id;
      update public.rental_fees set status = 'waived', admin_note = 'Host declined before payment' where id = b.fee_id and status = 'due';
    else
      update public.listing_requests set status = 'pending_payment' where id = b.id;
    end if;
  end if;
end;
$$;


revoke all on function public.booking_refresh(uuid) from public, anon, authenticated;

-- Places paused only because their booking was confirmed (no running stay yet) go back to the search.
do $$
declare
  place record;
begin
  for place in
    select distinct p.id from public.properties p
    join public.listing_requests b on b.listing_id = p.id and b.status = 'confirmed'
    where p.status = 'paused'
  loop
    perform set_config('sakani.owner_action', 'on', true);
    update public.properties set status = 'approved' where id = place.id;
    perform set_config('sakani.owner_action', 'off', true);
  end loop;
end;
$$;
