-- Sakani launch fixes: booking and money logic (QA of 2026-11-06).
--   1) Paying the host no longer ends a stay. "completed" now means the stay has ended.
--   2) A cancellation request only counts as occupying a place if the guest had moved in.
--   3) Hosts need a real account with a phone and an InstaPay address to take bookings.
--   4) admin_full_refund: refunds that aren't the guest's fault, with the cancellation policy off.
--   5) Stuck states: move-in date passed, contract unsigned, late transfers, wrong amounts, the payment clock.
--   6) A host's decline on an unverified transfer waits until the team confirms the money arrived.
--   7) The real refundable amount is kept on the booking.
--   8) The old success fee is gone from owner_report_rental.
--   9) Rooms and beds count people, not bookings.
--  10) Notices: refunds, cancellations, rejected cancellations, end of stay.
--  12) listing_events and listing_reports accept rented places.
--  13) Owners can edit published and paused places (back to review); host deadline; handover contact.
-- Safe to run twice. Run it in the Supabase SQL Editor before deploying the code that uses it.

-- ---------------------------------------------------------------------------
-- A) New columns (none on properties, so its column grants don't change)
-- ---------------------------------------------------------------------------
-- When an unpaid booking expires. Null means 24 hours after it was made.
alter table public.listing_requests add column if not exists pay_by timestamptz;
-- What actually goes back to the guest (may differ from total_amount).
alter table public.listing_requests add column if not exists refund_amount integer check (refund_amount is null or refund_amount >= 0);
-- Why the team recorded a step on someone's behalf.
alter table public.listing_requests add column if not exists contract_override_note text check (contract_override_note is null or char_length(contract_override_note) <= 500);
alter table public.listing_requests add column if not exists moved_in_note text check (moved_in_note is null or char_length(moved_in_note) <= 500);
-- What really arrived, when it isn't what was due.
alter table public.rental_fees add column if not exists received_amount integer check (received_amount is null or received_amount >= 0);

-- ---------------------------------------------------------------------------
-- B) Small shared rules
-- ---------------------------------------------------------------------------
-- The day a stay ends (the same month arithmetic everywhere).
create or replace function public.stay_end(start_day date, stay_months integer)
returns date
language sql
immutable
security definer
set search_path = ''
as $$
  select (start_day + make_interval(months => coalesce(stay_months, 1)))::date;
$$;

-- Someone is living there: moved in, or moved in and then asked to cancel.
create or replace function public.stay_is_running(booking_status text, status_before text)
returns boolean
language sql
immutable
security definer
set search_path = ''
as $$
  select coalesce(booking_status = 'moved_in' or (booking_status = 'cancellation_requested' and status_before = 'moved_in'), false);
$$;

-- Today in Egypt: what a guest sees on their calendar.
create or replace function public.cairo_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone 'Africa/Cairo')::date;
$$;

-- A host can take bookings with a real account, a phone and an address to be paid on.
create or replace function public.host_can_take_bookings(target_host uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.profiles p on p.id = u.id
    where u.id = target_host
      and coalesce(u.is_anonymous, false) = false
      and coalesce(trim(p.phone), '') <> ''
      and coalesce(trim(p.instapay_address), '') <> ''
  );
$$;

revoke all on function public.stay_end(date, integer) from public, anon, authenticated;
revoke all on function public.stay_is_running(text, text) from public, anon, authenticated;
revoke all on function public.cairo_today() from public, anon, authenticated;
revoke all on function public.host_can_take_bookings(uuid) from public, anon, authenticated;

-- For the listing page: yes or no, nothing about the host.
create or replace function public.listing_host_ready(target_listing uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.host_can_take_bookings(p.owner_id)
    from public.properties p
    where p.id = target_listing and p.status in ('approved', 'rented')
  ), false);
$$;

revoke all on function public.listing_host_ready(uuid) from public;
grant execute on function public.listing_host_ready(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- C) Creating a booking
-- ---------------------------------------------------------------------------
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

  select id, owner_id, title_en, title_ar, monthly_price, deposit as listing_deposit, is_demo, status, property_type, available_beds into listing
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
  if not public.host_can_take_bookings(listing.owner_id) then
    raise exception 'host_needs_account' using errcode = 'P0001';
  end if;
  if listing.property_type in ('room', 'bed') and coalesce(people, 1) > greatest(coalesce(listing.available_beds, 1), 1) then
    raise exception 'too_many_people' using errcode = 'P0001';
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

-- Rooms and beds fill up by people; a flat or studio takes one booking at a time. The count is the busiest
-- moment of the new stay, so two guests one after the other don't use up two beds. A host's "no" frees the
-- dates at once, even while the team is still checking the transfer.
create or replace function public.booking_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  place record;
  is_room boolean;
  taken integer;
  room_for integer;
  wanted integer;
begin
  if new.listing_id is null or new.move_in is null then
    return new;
  end if;
  if new.guest_id is not null and (
    select count(*) from public.listing_requests b
    where b.guest_id = new.guest_id and b.id <> new.id
      and b.status = 'pending_payment' and coalesce(b.pay_by, b.created_at + interval '24 hours') > now()
  ) >= 2 then
    raise exception 'too_many_unpaid' using errcode = 'P0001';
  end if;
  -- The lock makes two guests booking the last bed at the same moment wait for each other. Not FOR UPDATE: both
  -- already hold a key-share lock from the rental_fees foreign key, and FOR UPDATE would deadlock them.
  select available_from, property_type, available_beds into place from public.properties where id = new.listing_id for no key update;
  if place.available_from is not null and new.move_in < place.available_from then
    raise exception 'not_available_yet' using errcode = 'P0001';
  end if;
  is_room := place.property_type in ('room', 'bed');
  room_for := case when is_room then greatest(coalesce(place.available_beds, 1), 1) else 1 end;
  wanted := case when is_room then coalesce(new.guests, 1) else 1 end;

  with overlapping as (
    select b.move_in as day_from,
           public.stay_end(b.move_in, b.months) as day_to,
           case when is_room then b.guests else 1 end as heads
    from public.listing_requests b
    where b.listing_id = new.listing_id
      and b.id <> new.id
      and b.move_in is not null
      and b.host_decision <> 'declined'
      and (
        b.status in ('payment_review', 'confirmed', 'moved_in', 'cancellation_requested')
        or (b.status = 'pending_payment' and coalesce(b.pay_by, b.created_at + interval '24 hours') > now())
      )
      and daterange(b.move_in, public.stay_end(b.move_in, b.months))
          && daterange(new.move_in, public.stay_end(new.move_in, new.months))
  ), checkpoints as (
    select new.move_in as moment
    union
    select o.day_from from overlapping o where o.day_from > new.move_in
  )
  select coalesce(max(busy.heads_now), 0) into taken
  from checkpoints c
  cross join lateral (
    select coalesce(sum(o.heads), 0) as heads_now
    from overlapping o
    where o.day_from <= c.moment and o.day_to > c.moment
  ) busy;

  if taken + wanted > room_for then
    raise exception 'dates_taken' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- The dates a place is full, for its calendar. Dates only: nothing about who booked. A room with a free bed
-- isn't "booked", so only the stretches where every bed is taken come back, joined end to end.
create or replace function public.listing_booked_ranges(target_listing uuid)
returns table (starts date, ends date)
language sql
stable
security definer
set search_path = ''
as $$
  with place as (
    select p.id,
           p.property_type in ('room', 'bed') as is_room,
           case when p.property_type in ('room', 'bed') then greatest(coalesce(p.available_beds, 1), 1) else 1 end as capacity
    from public.properties p
    where p.id = target_listing and p.status in ('approved', 'reserved', 'rented')
  ), stays as (
    select b.move_in as day_from,
           public.stay_end(b.move_in, b.months) as day_to,
           case when place.is_room then b.guests else 1 end as heads
    from public.listing_requests b
    join place on place.id = b.listing_id
    where b.move_in is not null
      and b.host_decision <> 'declined'
      and b.status in ('payment_review', 'confirmed', 'moved_in', 'cancellation_requested')
      and public.stay_end(b.move_in, b.months) >= current_date
  ), edges as (
    select s.day_from as edge from stays s
    union
    select s.day_to from stays s
  ), slices as (
    select e.edge as day_from, lead(e.edge) over (order by e.edge) as day_to from edges e
  ), full_slices as (
    select s.day_from, s.day_to
    from slices s
    cross join place
    where s.day_to is not null
      and (select coalesce(sum(t.heads), 0) from stays t where t.day_from <= s.day_from and t.day_to >= s.day_to) >= place.capacity
  ), marked as (
    select f.day_from, f.day_to,
           case when lag(f.day_to) over (order by f.day_from) = f.day_from then 0 else 1 end as fresh
    from full_slices f
  ), grouped as (
    select m.day_from, m.day_to, sum(m.fresh) over (order by m.day_from) as island from marked m
  )
  select min(g.day_from), max(g.day_to)
  from grouped g
  group by g.island
  order by 1
  limit 24;
$$;

revoke all on function public.listing_booked_ranges(uuid) from public;
grant execute on function public.listing_booked_ranges(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- D) Who is living where
-- ---------------------------------------------------------------------------
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
  is_room boolean;
begin
  -- A stay whose end date has passed is over. (Before the owner_action flag below: this update comes back
  -- here through booking_listing_status, and that inner run switches the flag off.)
  update public.listing_requests set status = 'completed'
  where listing_id = target_listing and status = 'moved_in' and public.stay_end(move_in, months) <= current_date;

  select id, status, property_type, available_beds, rented_until, rented_source into place
  from public.properties where id = target_listing;
  if place.id is null or place.status not in ('approved', 'rented', 'reserved') then
    return place.status;
  end if;
  is_room := place.property_type in ('room', 'bed');

  select coalesce(sum(stays.heads), 0), min(stays.ends), max(stays.ends) into living, first_free, last_end
  from (
    select public.stay_end(b.move_in, b.months) as ends,
           case when is_room then b.guests else 1 end as heads
    from public.listing_requests b
    where b.listing_id = target_listing
      and public.stay_is_running(b.status, b.status_before_cancellation)
      and public.stay_end(b.move_in, b.months) > current_date
  ) stays;

  capacity := case when is_room then greatest(coalesce(place.available_beds, 1), 1) else 1 end;

  perform set_config('sakani.owner_action', 'on', true);
  if living >= capacity then
    -- A flat is free when its stay ends; a full room when its first bed frees up.
    update public.properties
    set status = 'rented',
        rented_source = 'booking',
        rented_until = case when is_room then first_free else last_end end
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
     and new.status in ('moved_in', 'completed', 'cancelled', 'refund_pending', 'refunded') then
    perform public.refresh_listing_occupancy(new.listing_id);
  end if;
  return new;
end;
$$;

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
    where b.listing_id = target_listing
      and public.stay_is_running(b.status, b.status_before_cancellation)
      and public.stay_end(b.move_in, b.months) > current_date
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

-- The daily job: places whose tenancy ended come back, stays that ended are completed, and people get their
-- reminders. Places go first, so the owner's "back in search" notice still goes out.
create or replace function public.release_ended_rentals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  place record;
  stay record;
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

  update public.listing_requests set status = 'completed'
  where status = 'moved_in' and public.stay_end(move_in, months) <= current_date;

  -- The stay ends within a week: once per booking.
  for stay in
    select b.id, b.guest_id, b.host_id, b.listing_title from public.listing_requests b
    where b.status = 'moved_in'
      and public.stay_end(b.move_in, b.months) between current_date + 1 and current_date + 7
      and not exists (select 1 from public.notifications n where n.booking_id = b.id and n.kind = 'stay_ending')
  loop
    perform public.notify_user(stay.guest_id, 'stay_ending', stay.id, jsonb_build_object('title', stay.listing_title));
    perform public.notify_user(stay.host_id, 'stay_ending', stay.id, jsonb_build_object('title', stay.listing_title));
  end loop;

  -- The move-in date has passed and nobody confirmed it: every 3 days until someone does.
  for stay in
    select b.id, b.guest_id, b.listing_title from public.listing_requests b
    where b.status = 'confirmed'
      and b.move_in < current_date
      and not exists (
        select 1 from public.notifications n
        where n.booking_id = b.id and n.kind = 'move_in_reminder' and n.created_at > now() - interval '3 days'
      )
  loop
    perform public.notify_user(stay.guest_id, 'move_in_reminder', stay.id, jsonb_build_object('title', stay.listing_title));
  end loop;

  return released;
end;
$$;

revoke all on function public.release_ended_rentals() from public, anon, authenticated;

-- Reviewer admins can't touch bookings (block_reviewer_admin would stop the whole run), so the panel only
-- runs this for full admins; the daily job covers the rest.
create or replace function public.admin_release_ended_rentals()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if not public.is_full_admin() then
    return 0;
  end if;
  return public.release_ended_rentals();
end;
$$;

revoke all on function public.admin_release_ended_rentals() from public, anon;
grant execute on function public.admin_release_ended_rentals() to authenticated;

-- ---------------------------------------------------------------------------
-- E) The booking's status, from the payment and the host's answer
-- ---------------------------------------------------------------------------
create or replace function public.booking_refresh(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  fee record;
begin
  select * into b from public.listing_requests where id = target_booking for update;
  if b.id is null then
    return;
  end if;
  if b.status = 'moved_in' and public.stay_end(b.move_in, b.months) <= current_date then
    update public.listing_requests set status = 'completed' where id = b.id;
    return;
  end if;
  -- A cancellation under review keeps its status: the team's decision moves it on.
  if b.status in ('moved_in', 'completed', 'cancellation_requested', 'refund_pending', 'refunded', 'cancelled') then
    return;
  end if;
  select status, received_amount into fee from public.rental_fees where id = b.fee_id;

  if fee.status = 'paid' then
    if b.host_decision = 'declined' then
      update public.listing_requests set status = 'refund_pending', refund_due_at = now() + interval '24 hours' where id = b.id;
    elsif b.host_decision = 'accepted' then
      -- Confirmed: the place stays in the search until the guest moves in (see 20261108000000).
      update public.listing_requests set status = 'confirmed', paid_at = coalesce(paid_at, now()) where id = b.id;
    else
      update public.listing_requests set status = 'payment_review', paid_at = coalesce(paid_at, now()) where id = b.id;
    end if;
  elsif fee.status = 'submitted' then
    -- A declined booking waits here too: nothing is refunded until the team confirms the money arrived.
    update public.listing_requests set status = 'payment_review' where id = b.id;
  else
    if b.host_decision = 'declined' then
      if coalesce(fee.received_amount, 0) > 0 then
        -- Part of the money did arrive, so that part goes back.
        update public.listing_requests set status = 'refund_pending', refund_due_at = now() + interval '24 hours' where id = b.id;
      else
        update public.listing_requests set status = 'cancelled' where id = b.id;
        update public.rental_fees set status = 'waived', admin_note = 'Host declined before payment' where id = b.fee_id and status = 'due';
      end if;
    else
      update public.listing_requests set status = 'pending_payment' where id = b.id;
    end if;
  end if;
end;
$$;

revoke all on function public.booking_refresh(uuid) from public, anon, authenticated;

-- When the upfront payment changes, the booking follows. "Not received" gives the guest a fresh 24 hours,
-- otherwise the hourly job would cancel the booking at once.
create or replace function public.rental_fees_sync_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  booking uuid;
begin
  if new.kind = 'upfront' and new.status is distinct from old.status then
    select id into booking from public.listing_requests where fee_id = new.id;
    if booking is not null then
      if old.status = 'submitted' and new.status = 'due' then
        update public.listing_requests set pay_by = now() + interval '24 hours' where id = booking;
      end if;
      perform public.booking_refresh(booking);
    end if;
  end if;
  return new;
end;
$$;

-- The refund is worked out once, when the booking starts waiting for it: an approved cancellation's amount,
-- or what was really paid (with the card fee), or the part that arrived.
create or replace function public.booking_refund_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed integer;
  paid record;
begin
  if new.status = 'refund_pending' and old.status is distinct from 'refund_pending' and new.refund_amount is null then
    select c.refundable_amount into allowed from public.cancellation_requests c
    where c.booking_id = new.id and c.status = 'approved'
    order by c.created_at desc limit 1;
    select f.status, f.amount, f.paid_amount, f.received_amount into paid from public.rental_fees f where f.id = new.fee_id;
    new.refund_amount := coalesce(
      allowed,
      case when paid.status = 'paid' then coalesce(paid.paid_amount, paid.amount) else paid.received_amount end,
      new.total_amount
    );
  end if;
  return new;
end;
$$;

revoke all on function public.booking_refund_amount() from public, anon, authenticated;

drop trigger if exists booking_refund_amount on public.listing_requests;
create trigger booking_refund_amount before update on public.listing_requests
  for each row execute function public.booking_refund_amount();

-- The hourly job. An expired booking with part of the money in goes to refund instead of being cancelled.
create or replace function public.expire_unpaid_bookings_job()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer := 0;
  n integer;
begin
  update public.rental_fees f set status = 'waived', admin_note = 'Expired: not paid within 24 hours'
  from public.listing_requests b
  where b.fee_id = f.id and b.status = 'pending_payment' and coalesce(b.pay_by, b.created_at + interval '24 hours') < now()
    and f.status = 'due' and coalesce(f.received_amount, 0) = 0;

  update public.listing_requests b
  set status = 'refund_pending', refund_due_at = now() + interval '24 hours',
      problem_note = coalesce(b.problem_note, 'The booking expired after part of the amount arrived.')
  from public.rental_fees f
  where b.fee_id = f.id and b.status = 'pending_payment' and coalesce(b.pay_by, b.created_at + interval '24 hours') < now()
    and coalesce(f.received_amount, 0) > 0;
  get diagnostics n = row_count;
  changed := changed + n;

  update public.listing_requests set status = 'cancelled'
  where status = 'pending_payment' and coalesce(pay_by, created_at + interval '24 hours') < now();
  get diagnostics n = row_count;
  changed := changed + n;

  update public.listing_requests set status = 'refund_pending', refund_due_at = now() + interval '24 hours',
    problem_note = coalesce(problem_note, 'The host did not answer within 24 hours.')
  where status = 'payment_review' and host_decision = 'pending' and paid_at is not null and paid_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return changed + n;
end;
$$;

revoke all on function public.expire_unpaid_bookings_job() from public, anon, authenticated;

-- Guest: cancel before paying. If part of a transfer already arrived, that part goes back.
create or replace function public.guest_cancel_booking(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  received integer;
begin
  select f.received_amount into received
  from public.listing_requests b
  join public.rental_fees f on f.id = b.fee_id
  where b.id = target_booking;

  if coalesce(received, 0) > 0 then
    update public.listing_requests
    set status = 'refund_pending', refund_due_at = now() + interval '24 hours', problem_note = coalesce(problem_note, 'The guest cancelled after part of the amount arrived.')
    where id = target_booking and guest_id = (select auth.uid()) and status = 'pending_payment';
    if not found then
      raise exception 'booking_not_found' using errcode = 'P0002';
    end if;
    return;
  end if;

  update public.listing_requests set status = 'cancelled'
  where id = target_booking and guest_id = (select auth.uid()) and status = 'pending_payment';
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  update public.rental_fees set status = 'waived', admin_note = 'Cancelled before payment'
  where id = (select fee_id from public.listing_requests where id = target_booking) and status = 'due';
end;
$$;

revoke all on function public.guest_cancel_booking(uuid) from public, anon;
grant execute on function public.guest_cancel_booking(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- F) Moving in and being paid
-- ---------------------------------------------------------------------------
-- Guest: I've moved in. Not before the move-in date: this is what releases the host's rent.
create or replace function public.guest_confirm_move_in(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  starts_on date;
begin
  select move_in into starts_on from public.listing_requests
  where id = target_booking and guest_id = (select auth.uid()) and status = 'confirmed';
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if starts_on > public.cairo_today() then
    raise exception 'move_in_too_early' using errcode = 'P0001';
  end if;
  update public.listing_requests set status = 'moved_in', moved_in_at = now() where id = target_booking;
end;
$$;

-- Admin: the guest moved in but never confirmed it (the host or the guest told the team).
create or replace function public.admin_confirm_moved_in(target_booking uuid, move_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  starts_on date;
begin
  if not public.is_full_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(move_note, ''))) not between 3 and 500 then
    raise exception 'invalid_note' using errcode = 'P0001';
  end if;
  select move_in into starts_on from public.listing_requests where id = target_booking and status = 'confirmed' for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if starts_on > public.cairo_today() then
    raise exception 'move_in_too_early' using errcode = 'P0001';
  end if;
  update public.listing_requests set status = 'moved_in', moved_in_at = now(), moved_in_note = trim(move_note) where id = target_booking;
end;
$$;

-- Admin: the contract was settled outside the site (or one side can't sign here), so the booking can go on.
create or replace function public.admin_override_contract(target_booking uuid, override_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_full_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(override_note, ''))) not between 5 and 500 then
    raise exception 'invalid_note' using errcode = 'P0001';
  end if;
  update public.listing_requests set contract_signed_at = now(), contract_override_note = trim(override_note)
  where id = target_booking and status in ('confirmed', 'moved_in') and contract_signed_at is null;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Admin: the host was paid. The stay goes on; "completed" comes when it ends. A stay that ended before the
-- team paid can still be paid.
create or replace function public.admin_mark_payout(target_booking uuid, transfer_reference text)
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
  update public.listing_requests set payout_reference = trim(transfer_reference), paid_out_at = now()
  where id = target_booking and status in ('moved_in', 'completed') and paid_out_at is null;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.guest_confirm_move_in(uuid) from public, anon;
revoke all on function public.admin_confirm_moved_in(uuid, text) from public, anon;
revoke all on function public.admin_override_contract(uuid, text) from public, anon;
revoke all on function public.admin_mark_payout(uuid, text) from public, anon;
grant execute on function public.guest_confirm_move_in(uuid) to authenticated;
grant execute on function public.admin_confirm_moved_in(uuid, text) to authenticated;
grant execute on function public.admin_override_contract(uuid, text) to authenticated;
grant execute on function public.admin_mark_payout(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- G) Payments that went wrong
-- ---------------------------------------------------------------------------
-- Admin: the transfer arrived with a different amount. The fee goes back to due with what arrived on record,
-- and the guest gets a fresh 24 hours (rental_fees_sync_booking) and a clear message on the payment page.
create or replace function public.admin_amount_differs(target_booking uuid, received integer, team_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  f record;
begin
  if not public.is_full_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if received is null or received not between 1 and 100000000 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  select * into b from public.listing_requests where id = target_booking for update;
  if b.id is null or b.status not in ('pending_payment', 'payment_review') then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  select * into f from public.rental_fees where id = b.fee_id for update;
  if f.id is null or f.status <> 'submitted' then
    raise exception 'fee_not_found' using errcode = 'P0002';
  end if;
  if received = f.amount then
    raise exception 'amount_matches' using errcode = 'P0001';
  end if;
  update public.rental_fees
  set status = 'due',
      received_amount = received,
      admin_note = left('وصلنا ' || received || ' من ' || f.amount || ' جنيه. / We received ' || received || ' of ' || f.amount || ' EGP.'
        || coalesce(' ' || nullif(trim(coalesce(team_note, '')), ''), ''), 500),
      decided_at = now(),
      decided_by = (select auth.uid())
  where id = f.id;
end;
$$;

-- Admin: a transfer arrived after the booking had expired. Like gateway_mark_paid does for cards, the money
-- is recorded and goes back to the guest.
create or replace function public.admin_late_transfer(target_booking uuid, received integer, transfer_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b record;
  f record;
begin
  if not public.is_full_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if received is null or received not between 1 and 100000000 then
    raise exception 'invalid_amount' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(transfer_reference, ''))) not between 3 and 64 then
    raise exception 'invalid_reference' using errcode = 'P0001';
  end if;
  select * into b from public.listing_requests where id = target_booking for update;
  if b.id is null or b.status <> 'cancelled' then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  select * into f from public.rental_fees where id = b.fee_id for update;
  if f.id is null or f.status not in ('due', 'waived') then
    raise exception 'fee_not_found' using errcode = 'P0002';
  end if;
  update public.listing_requests
  set status = 'refund_pending', refund_due_at = now() + interval '24 hours', refund_amount = received,
      problem_note = coalesce(problem_note, 'The transfer arrived after the booking had expired.')
  where id = b.id;
  update public.rental_fees
  set status = 'paid', method = coalesce(method, 'instapay'), reference = trim(transfer_reference), received_amount = received,
      admin_note = 'Arrived after the booking expired; goes back to the guest.', decided_at = now(), decided_by = (select auth.uid())
  where id = f.id;
end;
$$;

revoke all on function public.admin_amount_differs(uuid, integer, text) from public, anon;
revoke all on function public.admin_late_transfer(uuid, integer, text) from public, anon;
grant execute on function public.admin_amount_differs(uuid, integer, text) to authenticated;
grant execute on function public.admin_late_transfer(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- H) Cancellations and refunds
-- ---------------------------------------------------------------------------
-- Admin decides. Rejecting needs a reason the guest will read. Approval needs the policy on, a rule for the
-- scenario, and money that really arrived.
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
  clean_note text := nullif(trim(coalesce(note, '')), '');
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
    if char_length(coalesce(clean_note, '')) not between 5 and 1000 then
      raise exception 'invalid_note' using errcode = 'P0001';
    end if;
    update public.cancellation_requests set status = 'rejected', admin_note = clean_note, decided_at = now(), decided_by = (select auth.uid())
    where id = r.id;
    update public.listing_requests set status = coalesce(status_before_cancellation, 'confirmed'), status_before_cancellation = null where id = b.id;
    -- The payment may have been confirmed while the request was open.
    perform public.booking_refresh(b.id);
    perform public.notify_user(b.guest_id, 'cancellation_rejected', b.id, jsonb_build_object('title', b.listing_title));
    if r.requesting_party = 'host' then
      perform public.notify_user(b.host_id, 'cancellation_rejected', b.id, jsonb_build_object('title', b.listing_title));
    end if;
    return jsonb_build_object('status', 'rejected');
  end if;

  if not coalesce((select cancellation_policy_active from public.app_settings where id = 1), false) then
    raise exception 'policy_not_active' using errcode = 'P0001';
  end if;
  select * into rule from public.cancellation_rules where scenario = coalesce(nullif(chosen_scenario, ''), r.scenario);
  if rule.scenario is null or rule.refund_rent_percent is null or rule.refund_guest_fee is null or rule.refund_deposit is null then
    raise exception 'rule_not_set' using errcode = 'P0001';
  end if;
  if (select f.status from public.rental_fees f where f.id = b.fee_id) is distinct from 'paid' then
    raise exception 'payment_not_confirmed' using errcode = 'P0001';
  end if;

  deposit_sent := exists (select 1 from public.deposit_transfers where booking_id = b.id);
  refund := public.commission_for(coalesce(b.rent_amount, 0), rule.refund_rent_percent)
    + case when rule.refund_guest_fee then coalesce(b.guest_fee, 0) else 0 end
    + case when rule.refund_deposit and not deposit_sent then coalesce(b.deposit_amount, 0) else 0 end;

  update public.cancellation_requests
  set status = 'approved', scenario = rule.scenario, refundable_amount = refund,
      commission_treatment = case when rule.refund_guest_fee then 'guest_fee_refunded' else 'guest_fee_kept' end,
      deposit_treatment = case when not rule.refund_deposit then 'deposit_kept' when deposit_sent then 'host_returns_deposit' else 'deposit_refunded' end,
      admin_note = clean_note, decided_at = now(), decided_by = (select auth.uid())
  where id = r.id;
  update public.listing_requests set status = 'refund_pending', refund_due_at = now() + interval '24 hours', refund_amount = refund where id = b.id;
  return jsonb_build_object('status', 'approved', 'refundable_amount', refund);
end;
$$;

-- Full admin: the guest isn't at fault (the host cancelled, the place isn't available, the listing was wrong,
-- or Sakani failed), so everything they paid goes back. Works with the cancellation policy off.
create or replace function public.admin_full_refund(target_booking uuid, fault_case text, fault_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  b record;
  f record;
  whole integer;
  deposit_sent boolean;
  open_request uuid;
  clean_note text := nullif(trim(coalesce(fault_note, '')), '');
begin
  if not public.is_full_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if coalesce(fault_case, '') not in ('host_cancels', 'property_unavailable', 'inaccurate_listing', 'platform_failure') then
    raise exception 'invalid_scenario' using errcode = 'P0001';
  end if;
  if char_length(coalesce(clean_note, '')) not between 5 and 1000 then
    raise exception 'invalid_note' using errcode = 'P0001';
  end if;
  select * into b from public.listing_requests where id = target_booking for update;
  if b.id is null then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if b.status not in ('pending_payment', 'payment_review', 'confirmed', 'moved_in', 'cancellation_requested') then
    raise exception 'cannot_refund_now' using errcode = 'P0001';
  end if;
  select * into f from public.rental_fees where id = b.fee_id for update;
  -- Only money that really arrived: a transfer the team hasn't confirmed isn't refunded.
  whole := case when f.status = 'paid' then coalesce(f.paid_amount, f.amount) else coalesce(f.received_amount, 0) end;
  if coalesce(whole, 0) <= 0 then
    raise exception 'payment_not_confirmed' using errcode = 'P0001';
  end if;

  deposit_sent := exists (select 1 from public.deposit_transfers where booking_id = b.id);
  select id into open_request from public.cancellation_requests
  where booking_id = b.id and status = 'pending' order by created_at desc limit 1;

  if open_request is null then
    insert into public.cancellation_requests (booking_id, requested_by, requesting_party, scenario, reason, amount_paid, refundable_amount,
      commission_treatment, deposit_treatment, status, admin_note, decided_at, decided_by)
    values (b.id, me, 'admin', fault_case, clean_note, whole, whole, 'guest_fee_refunded',
      case when deposit_sent then 'host_returns_deposit' else 'deposit_refunded' end, 'approved', clean_note, now(), me);
  else
    update public.cancellation_requests
    set status = 'approved', scenario = fault_case, refundable_amount = whole, commission_treatment = 'guest_fee_refunded',
        deposit_treatment = case when deposit_sent then 'host_returns_deposit' else 'deposit_refunded' end,
        admin_note = clean_note, decided_at = now(), decided_by = me
    where id = open_request;
  end if;

  update public.listing_requests
  set status = 'refund_pending', refund_due_at = now() + interval '24 hours', refund_amount = whole,
      problem_note = coalesce(problem_note, clean_note), problem_at = coalesce(problem_at, now())
  where id = b.id;
  return jsonb_build_object('status', 'refund_pending', 'refundable_amount', whole, 'deposit_sent', deposit_sent, 'host_paid', b.paid_out_at is not null);
end;
$$;

revoke all on function public.admin_decide_cancellation(uuid, boolean, text, text) from public, anon;
revoke all on function public.admin_full_refund(uuid, text, text) from public, anon;
grant execute on function public.admin_decide_cancellation(uuid, boolean, text, text) to authenticated;
grant execute on function public.admin_full_refund(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- I) Notices
-- ---------------------------------------------------------------------------
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
      -- Back from a rejected cancellation it isn't news: the guest gets cancellation_rejected instead.
      if old.status <> 'cancellation_requested' then
        perform public.notify_user(new.guest_id, 'booking_confirmed', new.id, info);
        perform public.notify_user(new.host_id, 'booking_confirmed', new.id, info);
        perform public.notify_user(new.guest_id, 'agreement_ready', new.id, info);
        perform public.notify_user(new.host_id, 'agreement_ready', new.id, info);
      end if;
    elsif new.status = 'cancellation_requested' then
      perform public.notify_user(new.guest_id, 'cancellation_requested', new.id, info);
      perform public.notify_user(new.host_id, 'cancellation_requested', new.id, info);
    elsif new.status = 'refund_pending' then
      perform public.notify_user(new.guest_id, 'refund_pending', new.id, info);
      perform public.notify_user(new.host_id, 'refund_pending_host', new.id, info);
    elsif new.status = 'refunded' then
      perform public.notify_user(new.guest_id, 'refund_done', new.id, info);
      perform public.notify_user(new.host_id, 'refund_done_host', new.id, info);
    elsif new.status = 'cancelled' then
      perform public.notify_user(new.guest_id, 'booking_cancelled', new.id, info);
      -- A host who said no already knows.
      if new.host_decision <> 'declined' then
        perform public.notify_user(new.host_id, 'booking_cancelled_host', new.id, info);
      end if;
    elsif new.status = 'completed' then
      perform public.notify_user(new.guest_id, 'stay_completed', new.id, info);
      perform public.notify_user(new.host_id, 'stay_completed', new.id, info);
    end if;
  end if;
  if new.paid_out_at is not null and old.paid_out_at is null then
    perform public.notify_user(new.host_id, 'payout_sent', new.id, info);
  end if;
  if new.contract_signed_at is not null and old.contract_signed_at is null then
    perform public.notify_user(new.guest_id, 'agreement_signed', new.id, info);
    perform public.notify_user(new.host_id, 'agreement_signed', new.id, info);
  end if;
  return new;
end;
$$;

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
      perform public.notify_user(new.guest_id,
        case when new.received_amount is distinct from old.received_amount and new.received_amount is not null then 'payment_amount_differs' else 'payment_failed' end,
        new.request_id, jsonb_build_object('title', new.listing_title, 'amount', new.amount));
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- J) Hosts: bookings, the end of the anonymous session, and the old success fee
-- ---------------------------------------------------------------------------
-- Hosts also see their deadline to answer, the contract and the refund. (The return type changes, so drop it.)
drop function if exists public.host_bookings();
create function public.host_bookings()
returns table (
  id uuid, listing_id uuid, listing_title text, guest_first_name text, move_in date, months integer, guests integer,
  status text, host_decision text, rent_amount integer, host_fee integer, payout_amount integer, paid_out_at timestamptz,
  deposit_amount integer, deposit_status text, created_at timestamptz,
  decide_by timestamptz, contract_signed_at timestamptz, refund_amount integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.listing_id, b.listing_title, split_part(b.name, ' ', 1), b.move_in, b.months, b.guests,
         b.status, b.host_decision, b.rent_amount, b.host_fee, b.payout_amount, b.paid_out_at,
         b.deposit_amount, d.status, b.created_at,
         case when b.status = 'payment_review' and b.host_decision = 'pending' then b.paid_at + interval '24 hours' end,
         b.contract_signed_at, b.refund_amount
  from public.listing_requests b
  left join public.deposit_transfers d on d.booking_id = b.id
  where b.host_id = (select auth.uid()) and b.status <> 'cancelled'
  order by b.created_at desc
  limit 200;
$$;

revoke all on function public.host_bookings() from public, anon;
grant execute on function public.host_bookings() to authenticated;

-- Everything tied to the old session moves to the account, not only the listings.
create or replace function public.claim_listing_transfer(transfer_token uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  source_user uuid;
  moved integer;
  old_thread uuid;
  my_thread uuid;
begin
  if me is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'account_required' using errcode = '42501';
  end if;

  select from_user into source_user
  from public.listing_transfers
  where token = transfer_token
    and claimed_at is null
    and created_at > now() - interval '1 day'
  for update;

  if source_user is null then
    return 0;
  end if;

  -- Tells properties_guard this ownership change is an approved transfer, so it keeps
  -- each listing's review status instead of resetting it. Transaction-local.
  perform set_config('sakani.listing_transfer', 'on', true);
  update public.properties set owner_id = me where owner_id = source_user;
  get diagnostics moved = row_count;
  perform set_config('sakani.listing_transfer', 'off', true);

  update public.listing_requests set host_id = me where host_id = source_user;
  update public.deposit_transfers set host_id = me where host_id = source_user;
  update public.rental_fees set owner_id = me where owner_id = source_user;
  update public.reviews set host_id = me where host_id = source_user;
  update public.cancellation_requests set requested_by = me where requested_by = source_user;
  update public.notifications set user_id = me where user_id = source_user;
  update public.contract_acceptances a set user_id = me
  where a.user_id = source_user
    and not exists (
      select 1 from public.contract_acceptances mine
      where mine.user_id = me and mine.document = a.document and mine.document_version = a.document_version
        and mine.booking_id is not distinct from a.booking_id
    );

  -- The team may have written to the old session: the messages join this account's thread.
  select id into old_thread from public.support_threads where user_id = source_user;
  if old_thread is not null then
    select id into my_thread from public.support_threads where user_id = me;
    if my_thread is null then
      update public.support_threads set user_id = me where id = old_thread;
    else
      update public.support_messages set thread_id = my_thread where thread_id = old_thread;
      delete from public.support_threads where id = old_thread;
    end if;
    update public.support_messages set sender_id = me where sender_id = source_user;
  end if;

  update public.listing_transfers
  set claimed_by = me, claimed_at = now()
  where token = transfer_token;

  return moved;
end;
$$;

revoke all on function public.claim_listing_transfer(uuid) from public, anon;
grant execute on function public.claim_listing_transfer(uuid) to authenticated;

-- A place rented outside Sakani: an end date and nothing else. The host's 10% is taken from the booking, so
-- there is no separate success fee any more; via_sakani stays only so older pages keep working.
create or replace function public.owner_report_rental(target_listing uuid, via_sakani boolean, rented_until date default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  listing record;
  ends date := coalesce(rented_until, (current_date + interval '12 months')::date);
begin
  select id, status, rented_source into listing
  from public.properties
  where id = target_listing and owner_id = (select auth.uid());

  if listing.id is null then
    raise exception 'listing_not_found' using errcode = 'P0002';
  end if;
  if listing.status = 'rented' and listing.rented_source = 'booking' then
    raise exception 'listing_status_not_allowed' using errcode = 'P0001';
  end if;
  -- A rented place can be reported again to change its end date.
  if listing.status not in ('approved', 'paused', 'rented') then
    raise exception 'listing_status_not_allowed' using errcode = 'P0001';
  end if;
  if ends <= current_date or ends > (current_date + interval '5 years')::date then
    raise exception 'invalid_end_date' using errcode = 'P0001';
  end if;

  perform set_config('sakani.owner_action', 'on', true);
  update public.properties set status = 'rented', rented_until = ends, rented_source = 'owner' where id = target_listing;
  perform set_config('sakani.owner_action', 'off', true);

  return jsonb_build_object('status', 'rented', 'rented_until', ends);
end;
$$;

revoke all on function public.owner_report_rental(uuid, boolean, date) from public, anon;
grant execute on function public.owner_report_rental(uuid, boolean, date) to authenticated;

-- Owners can edit published and paused places too: properties_guard sends every owner edit back to review,
-- and the check below insists on it. A rented place stays locked while someone lives there.
drop policy if exists "Owners can update their pending properties" on public.properties;
create policy "Owners can update their pending properties"
  on public.properties for update to authenticated
  using (
    (select auth.uid()) = owner_id
    and status in ('pending', 'rejected', 'approved', 'paused')
  )
  with check (
    (select auth.uid()) = owner_id
    and status = 'pending'
  );

-- ---------------------------------------------------------------------------
-- K) What guests can see
-- ---------------------------------------------------------------------------
-- After confirmation: who to call for the keys and where. Only the booking's guest (or an admin).
-- Listings have no exact address yet, so this is the area and the host's contact.
create or replace function public.booking_handover(target_booking uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  b record;
  place record;
  host record;
begin
  select id, guest_id, host_id, listing_id, status into b from public.listing_requests where id = target_booking;
  if b.id is null or not (b.guest_id = (select auth.uid()) or public.is_admin()) then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if b.status not in ('confirmed', 'moved_in') then
    raise exception 'booking_not_confirmed' using errcode = 'P0001';
  end if;
  select area, governorate, whatsapp_number into place from public.properties where id = b.listing_id;
  select full_name, phone into host from public.profiles where id = b.host_id;
  return jsonb_build_object(
    'area', place.area,
    'governorate', place.governorate,
    'host_first_name', nullif(split_part(coalesce(host.full_name, ''), ' ', 1), ''),
    'contact', coalesce(nullif(host.phone, ''), nullif(place.whatsapp_number, ''))
  );
end;
$$;

revoke all on function public.booking_handover(uuid) from public, anon;
grant execute on function public.booking_handover(uuid) to authenticated;

-- The guest can follow their deposit too.
drop policy if exists "Hosts and admins read deposit transfers" on public.deposit_transfers;
drop policy if exists "Parties and admins read deposit transfers" on public.deposit_transfers;
create policy "Parties and admins read deposit transfers"
  on public.deposit_transfers for select to authenticated
  using (
    host_id = (select auth.uid())
    or (select public.is_admin())
    or exists (select 1 from public.listing_requests b where b.id = booking_id and b.guest_id = (select auth.uid()))
  );

-- Documents: the real refund, and what the card was really charged.
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
  select id, status, method, reference, submitted_at, decided_at, card_fee, paid_amount into fee from public.rental_fees where id = b.fee_id;
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
      'refund_amount', b.refund_amount, 'payout_reference', b.payout_reference, 'paid_out_at', b.paid_out_at
    ),
    'listing', case when listing is null then null else jsonb_build_object(
      'title_ar', listing.title_ar, 'title_en', listing.title_en, 'governorate', listing.governorate, 'area', listing.area,
      'property_type', listing.property_type, 'gender', listing.gender) end,
    'guest_name', coalesce(nullif(guest_name, ''), b.name),
    'host_name', coalesce(host_name, ''),
    'payment', case when fee.id is null then null else jsonb_build_object(
      'id', fee.id, 'status', fee.status, 'method', fee.method, 'reference', fee.reference, 'submitted_at', fee.submitted_at, 'decided_at', fee.decided_at,
      'card_fee', fee.card_fee, 'paid_amount', fee.paid_amount) end,
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

-- ---------------------------------------------------------------------------
-- L) Finance: "completed" no longer means the host was paid, so payouts have their own lines
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
    'refunded_value', coalesce((select sum(coalesce(refund_amount, total_amount)) from scope where status = 'refunded'), 0),
    'completed_bookings', (select count(*) from scope where status = 'completed'),
    'running_stays', (select count(*) from scope where status = 'moved_in'),
    'payouts_sent', coalesce((select sum(payout_amount) from scope where paid_out_at is not null), 0),
    'payouts_due', coalesce((select sum(payout_amount) from scope where paid_out_at is null and status in ('moved_in', 'completed')), 0),
    'cancelled_bookings', (select count(*) from scope where status in ('cancelled', 'refunded')),
    'all_bookings', (select count(*) from scope)
  ) into result;
  return result;
end;
$$;

revoke all on function public.admin_finance_summary(date, date) from public, anon;
grant execute on function public.admin_finance_summary(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- M) Rented pages: reports and view tracking stopped failing with a 403 there
-- ---------------------------------------------------------------------------
drop policy if exists "Anyone can report published listings" on public.listing_reports;
create policy "Anyone can report published listings"
  on public.listing_reports for insert to anon, authenticated
  with check (
    status = 'open'
    and resolved_at is null
    and resolved_by is null
    and exists (select 1 from public.properties p where p.id = listing_id and p.status in ('approved', 'rented'))
  );

drop policy if exists "Anyone can record events on published listings" on public.listing_events;
create policy "Anyone can record events on published listings"
  on public.listing_events for insert to anon, authenticated
  with check (exists (select 1 from public.properties p where p.id = listing_id and p.status in ('approved', 'rented')));

-- ---------------------------------------------------------------------------
-- N) Existing rows
-- ---------------------------------------------------------------------------
-- These updates fix stored data, so nobody is notified and no listing is stamped "updated". properties_guard
-- is off, as in 20261108000000. properties_timeline stays on here: refresh_listing_occupancy goes through its
-- owner_action path and needs it to clear rented_until when a place is freed. No property row is written directly.
alter table public.listing_requests disable trigger notify_booking_events;
alter table public.properties disable trigger properties_guard;

-- "Completed" used to mean "the host was paid": stays still running go back to moved_in, which rents the place
-- again through booking_listing_status.
update public.listing_requests
set status = 'moved_in'
where status = 'completed'
  and fee_id is not null
  and moved_in_at is not null
  and move_in is not null
  and public.stay_end(move_in, months) > current_date;

-- Stays that ended while marked moved_in are over.
update public.listing_requests
set status = 'completed'
where status = 'moved_in' and move_in is not null and public.stay_end(move_in, months) <= current_date;

-- Refunds in progress or done: the amount, as the booking_refund_amount trigger now works it out.
update public.listing_requests b
set refund_amount = coalesce(
  (select c.refundable_amount from public.cancellation_requests c
   where c.booking_id = b.id and c.status in ('approved', 'refunded') and c.refundable_amount is not null
   order by c.created_at desc limit 1),
  (select coalesce(f.paid_amount, f.amount) from public.rental_fees f where f.id = b.fee_id),
  b.total_amount)
where b.status in ('refund_pending', 'refunded') and b.refund_amount is null;

-- Places rented only because of a cancellation request made before move-in come back; running stays are rented.
do $$
declare
  place record;
begin
  for place in select id from public.properties where status in ('reserved', 'rented') loop
    perform public.refresh_listing_occupancy(place.id);
  end loop;
end;
$$;

alter table public.properties enable trigger properties_guard;
alter table public.listing_requests enable trigger notify_booking_events;
