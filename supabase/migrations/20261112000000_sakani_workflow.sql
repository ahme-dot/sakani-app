-- Sakani day-to-day workflow.
--   1) Team alerts on Telegram: nothing is sent until the bot is set up (docs/deployment.md).
--   2) Host sign-up keeps the InstaPay address (it works with email confirmation on).
--   3) Small edits (price, dates, beds, amenities) don't send a published place back to review.
--   4) A monthly "still available?" notice for places nobody has confirmed or edited in 30 days.
-- Changes no stored rows except one new settings row. Safe to run twice. Run it in the Supabase SQL Editor before
-- deploying the code that uses it.

-- ---------------------------------------------------------------------------
-- A) Team alerts
-- ---------------------------------------------------------------------------
-- One row, reachable from the SQL Editor only: no policy, and no grants for site visitors.
create table if not exists public.team_alert_settings (
  id smallint primary key default 1 check (id = 1),
  bot_token text not null default '',
  chat_id text not null default '',
  site_url text not null default ''
);

alter table public.team_alert_settings enable row level security;
revoke all on public.team_alert_settings from public, anon, authenticated;

insert into public.team_alert_settings (id, site_url)
values (1, 'https://sakani-app-olive.vercel.app')
on conflict (id) do nothing;

-- Sends web requests from the database. Without it team_alert quietly does nothing.
do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net is not available; enable it in Database → Extensions for the Telegram alerts.';
end;
$$;

-- pg_net sends after the transaction commits, and a rolled-back transaction sends nothing. Whatever goes wrong here
-- (no bot yet, no pg_net, a bad token) ends in the exception block: an alert can never stop a booking or a payment.
-- Automated test records carry the test tag and stay out of the team's chat.
create or replace function public.team_alert(alert_text text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  chat text;
  site text;
  message text;
begin
  select trim(s.bot_token), trim(s.chat_id), rtrim(trim(s.site_url), '/')
  into token, chat, site
  from public.team_alert_settings s
  where s.id = 1;

  if coalesce(token, '') = '' or coalesce(chat, '') = '' or coalesce(alert_text, '') like '%[E2E TEST]%' then
    return;
  end if;

  message := left(coalesce(alert_text, ''), 500);
  if coalesce(site, '') <> '' then
    message := message || E'\n' || site || '/ar/admin';
  end if;

  perform net.http_post(
    url := 'https://api.telegram.org/bot' || token || '/sendMessage',
    body := jsonb_build_object('chat_id', chat, 'text', message, 'disable_web_page_preview', true),
    headers := jsonb_build_object('Content-Type', 'application/json')
  );
exception when others then
  raise notice 'team_alert: not sent';
end;
$$;

revoke all on function public.team_alert(text) from public, anon, authenticated;

-- What the team hears about. Each trigger has its own safety net, so nothing in it can reach the action behind it.
create or replace function public.team_alert_booking()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.team_alert('حجز جديد: ' || coalesce(new.listing_title, ''));
  exception when others then
    raise notice 'team_alert_booking: skipped';
  end;
  return new;
end;
$$;

create or replace function public.team_alert_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.team_alert('تحويل جديد محتاج مراجعة: ' || coalesce(new.listing_title, ''));
  exception when others then
    raise notice 'team_alert_transfer: skipped';
  end;
  return new;
end;
$$;

-- A guest's "there's a problem" opens a cancellation request too; who asked tells the two apart.
create or replace function public.team_alert_cancellation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  place text;
begin
  begin
    select b.listing_title into place from public.listing_requests b where b.id = new.booking_id;
    perform public.team_alert(
      case when new.requesting_party = 'guest' then 'المستأجر بلّغ عن مشكلة: ' else 'طلب إلغاء: ' end || coalesce(place, '')
    );
  exception when others then
    raise notice 'team_alert_cancellation: skipped';
  end;
  return new;
end;
$$;

-- Team edits and demo listings aren't work for the team.
create or replace function public.team_alert_listing()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if new.status = 'pending' and not new.is_demo and not coalesce(public.is_admin(), false)
      and (tg_op = 'INSERT' or old.status is distinct from 'pending') then
      perform public.team_alert('إعلان محتاج مراجعة: ' || coalesce(new.title_ar, ''));
    end if;
  exception when others then
    raise notice 'team_alert_listing: skipped';
  end;
  return new;
end;
$$;

-- The subject is the person's own words, so only the ticket's number goes out.
create or replace function public.team_alert_ticket()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if coalesce(new.subject, '') not like '[E2E%' then
      perform public.team_alert('تذكرة دعم جديدة #' || new.number);
    end if;
  exception when others then
    raise notice 'team_alert_ticket: skipped';
  end;
  return new;
end;
$$;

revoke all on function public.team_alert_booking() from public, anon, authenticated;
revoke all on function public.team_alert_transfer() from public, anon, authenticated;
revoke all on function public.team_alert_cancellation() from public, anon, authenticated;
revoke all on function public.team_alert_listing() from public, anon, authenticated;
revoke all on function public.team_alert_ticket() from public, anon, authenticated;

drop trigger if exists team_alert_booking on public.listing_requests;
create trigger team_alert_booking after insert on public.listing_requests
  for each row execute function public.team_alert_booking();

drop trigger if exists team_alert_transfer on public.rental_fees;
create trigger team_alert_transfer after update on public.rental_fees
  for each row when (new.status = 'submitted' and old.status is distinct from 'submitted')
  execute function public.team_alert_transfer();

drop trigger if exists team_alert_cancellation on public.cancellation_requests;
create trigger team_alert_cancellation after insert on public.cancellation_requests
  for each row execute function public.team_alert_cancellation();

-- Not "update of status": properties_guard changes the status itself, and that doesn't count as naming the column.
drop trigger if exists team_alert_listing on public.properties;
create trigger team_alert_listing after insert or update on public.properties
  for each row execute function public.team_alert_listing();

drop trigger if exists team_alert_ticket on public.support_tickets;
create trigger team_alert_ticket after insert on public.support_tickets
  for each row execute function public.team_alert_ticket();

-- ---------------------------------------------------------------------------
-- B) Sign-up: a host's InstaPay address arrives with the sign-up details
-- ---------------------------------------------------------------------------
-- This runs when the account is created, before any email confirmation, so nothing has to wait for a session.
-- Whatever was sent is shortened, not refused: a bad address must not stop the sign-up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  clean_phone text := coalesce(meta ->> 'phone', '');
  account_role text := case when meta ->> 'role' = 'guest' then 'guest' else 'host' end;
  clean_instapay text := left(trim(coalesce(meta ->> 'instapay_address', '')), 80);
begin
  if coalesce(new.is_anonymous, false) then
    return new;
  end if;
  if clean_phone !~ '^[+0-9 ()-]{8,20}$' then
    clean_phone := '';
  end if;
  insert into public.profiles (id, role, full_name, phone, instapay_address)
  values (
    new.id,
    account_role,
    left(coalesce(meta ->> 'full_name', ''), 80),
    clean_phone,
    case when account_role = 'host' then clean_instapay else '' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- C) Small edits keep a place live
-- ---------------------------------------------------------------------------
-- Everything but the list below goes back to review, as before, so a column added later is reviewed by default.
create or replace function public.properties_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
  -- What an owner can change on a published or paused place without a new review.
  small_fields constant text[] := array[
    'monthly_price', 'deposit', 'available_from', 'min_months', 'available_beds',
    'furnished', 'wifi', 'air_conditioning', 'kitchen', 'washing_machine', 'fridge', 'water_heater', 'elevator', 'security'
  ];
  -- What this function decides itself, so what the owner sends for these says nothing about the edit.
  guarded_fields constant text[] := array['status', 'verified', 'verified_at', 'rejection_reason', 'owner_id', 'created_at', 'updated_at'];
  before_edit jsonb;
  after_edit jsonb;
begin
  -- Only an admin can set this stamp by hand (the monthly reminder's test needs an old date).
  if tg_op = 'INSERT' then
    new.updated_at := now();
  elsif not (coalesce(public.is_admin(), false) and new.updated_at is distinct from old.updated_at) then
    new.updated_at := now();
  end if;

  if coalesce(public.is_admin(), false)
    or coalesce(current_setting('sakani.listing_transfer', true), '') = 'on'
    or coalesce(current_setting('sakani.owner_action', true), '') = 'on' then
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

    before_edit := to_jsonb(old) - small_fields - guarded_fields;
    after_edit := to_jsonb(new) - small_fields - guarded_fields;

    if old.status in ('approved', 'paused') and before_edit = after_edit then
      -- The owner's values for these are ignored, the same as for any other edit: only the old ones stand.
      new.status := old.status;
      new.verified := old.verified;
      new.verified_at := old.verified_at;
      new.rejection_reason := old.rejection_reason;

      select jsonb_object_agg(f.field, to_jsonb(old) -> f.field), jsonb_object_agg(f.field, to_jsonb(new) -> f.field)
      into before_edit, after_edit
      from unnest(small_fields) as f (field)
      where to_jsonb(old) -> f.field is distinct from to_jsonb(new) -> f.field;

      if after_edit is not null then
        insert into public.audit_logs (actor, entity, entity_id, action, old_data, new_data)
        values ((select auth.uid()), 'properties', new.id::text, 'owner_small_edit', before_edit, after_edit);
        perform public.team_alert('تعديل بسيط على إعلان منشور: ' || coalesce(new.title_ar, ''));
      end if;
    else
      new.verified := false;
      new.verified_at := null;
      new.rejection_reason := null;
      new.status := 'pending';
    end if;
  end if;

  return new;
end;
$$;

-- properties_guard runs first and decides the status; this only has to accept what it left. An owner's own
-- status value never gets this far.
drop policy if exists "Owners can update their pending properties" on public.properties;
create policy "Owners can update their pending properties"
  on public.properties for update to authenticated
  using (
    (select auth.uid()) = owner_id
    and status in ('pending', 'rejected', 'approved', 'paused')
  )
  with check (
    (select auth.uid()) = owner_id
    and status in ('pending', 'approved', 'paused')
  );

-- ---------------------------------------------------------------------------
-- D) The daily job: the monthly "still available?" notice
-- ---------------------------------------------------------------------------
-- updated_at is what confirm_listing stamps, and every edit moves it too. Same as 20261111000000, plus the last loop.
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

  -- Nobody confirmed or edited this place for 30 days: ask the owner, at most once in 30 days.
  for place in
    select p.id, p.owner_id, p.title_ar, p.title_en from public.properties p
    where p.status = 'approved'
      and not p.is_demo
      and p.updated_at < now() - interval '30 days'
      and not exists (
        select 1 from public.notifications n
        where n.user_id = p.owner_id
          and n.kind = 'listing_still_available'
          and n.data ->> 'listing_id' = p.id::text
          and n.created_at > now() - interval '30 days'
      )
  loop
    perform public.notify_user(place.owner_id, 'listing_still_available', null,
      jsonb_build_object('title', place.title_ar, 'title_en', place.title_en, 'listing_id', place.id));
  end loop;

  return released;
end;
$$;

revoke all on function public.release_ended_rentals() from public, anon, authenticated;

-- Trigger functions: nothing calls these directly.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.properties_guard() from public, anon, authenticated;
