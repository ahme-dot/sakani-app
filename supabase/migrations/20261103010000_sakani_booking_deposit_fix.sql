-- Fix for 20261103000000: the variable "deposit" clashed with the column properties.deposit.
-- Run once in the Supabase SQL Editor. Safe to run again.

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

