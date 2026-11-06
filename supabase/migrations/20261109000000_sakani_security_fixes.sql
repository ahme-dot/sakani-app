-- Sakani security fixes (review of 2026-11-05):
--   1) Payout details (InstaPay), phone and "identity checked" can't be changed by a reviewer admin;
--      the owner is told when their InstaPay address changes.
--   2) Two old listing policies now ask for the two-step code like every other admin rule.
--   3) Sandbox payments can only be settled by a full admin.
--   4) Unpaid bookings expire on their own every hour, an expired one never blocks dates, and a guest
--      can hold at most 2 unpaid bookings at once.
--   5) Identity documents: full admins only.
--   6) release_ended_rentals: the daily job and admins only.
--   7) Contact messages and error reports are limited per sender, not for the whole site.
-- Safe to run more than once. Run it before deploying the code that uses it.

-- ---------------------------------------------------------------------------
-- 1) Profiles: who may change payout details, phone and the identity mark
-- ---------------------------------------------------------------------------
create or replace function public.profiles_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  verified boolean := new.id_verified;
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  -- No signed-in user (SQL Editor, scheduled jobs): stored data is being fixed, leave it.
  if me is null then
    return new;
  end if;
  if me = old.id then
    -- The person themselves: everything except the identity mark.
    if not public.is_full_admin() then
      new.id_verified := old.id_verified;
    end if;
  else
    -- Someone else (an admin): only a full admin, and only the identity mark.
    if not public.is_full_admin() then
      raise exception 'reviewer_not_allowed' using errcode = '42501';
    end if;
    new := old;
    new.id_verified := verified;
    new.updated_at := now();
  end if;
  if new.instapay_address is distinct from old.instapay_address and old.instapay_address <> '' then
    perform public.notify_user(old.id, 'payout_changed', null, '{}'::jsonb);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) The two listing policies from 20261018010000 checked admin_users directly, so a session without
--    the two-step code could read and edit every listing. Same rule as everywhere else now.
-- ---------------------------------------------------------------------------
drop policy if exists "Admins can read all property submissions" on public.properties;
create policy "Admins can read all property submissions"
  on public.properties for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can review property submissions" on public.properties;
create policy "Admins can review property submissions"
  on public.properties for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 3) Sandbox payments: full admins only (a guest could otherwise mark their own booking paid).
-- ---------------------------------------------------------------------------
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
  if not public.is_full_admin() then
    raise exception 'sandbox_admin_only' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- 4) Unpaid bookings
-- ---------------------------------------------------------------------------
-- The work itself, for the hourly job (no user) and for admins (through expire_unpaid_bookings).
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
  where b.fee_id = f.id and b.status = 'pending_payment' and b.created_at < now() - interval '24 hours' and f.status = 'due';
  update public.listing_requests set status = 'cancelled'
  where status = 'pending_payment' and created_at < now() - interval '24 hours';
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

create or replace function public.expire_unpaid_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  return public.expire_unpaid_bookings_job();
end;
$$;

-- An unpaid booking older than 24 hours never blocks dates (even before the job has run), and a
-- guest can hold at most 2 unpaid bookings at once.
create or replace function public.booking_availability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  place record;
  taken integer;
  room_for integer;
begin
  if new.listing_id is null or new.move_in is null then
    return new;
  end if;
  if new.guest_id is not null and (
    select count(*) from public.listing_requests b
    where b.guest_id = new.guest_id and b.id <> new.id
      and b.status = 'pending_payment' and b.created_at > now() - interval '24 hours'
  ) >= 2 then
    raise exception 'too_many_unpaid' using errcode = 'P0001';
  end if;
  select available_from, property_type, available_beds into place from public.properties where id = new.listing_id;
  if place.available_from is not null and new.move_in < place.available_from then
    raise exception 'not_available_yet' using errcode = 'P0001';
  end if;
  select count(*) into taken
  from public.listing_requests b
  where b.listing_id = new.listing_id
    and b.id <> new.id
    and (
      b.status in ('payment_review', 'confirmed', 'moved_in', 'cancellation_requested')
      or (b.status = 'pending_payment' and b.created_at > now() - interval '24 hours')
    )
    and daterange(b.move_in, (b.move_in + make_interval(months => coalesce(b.months, 1)))::date)
        && daterange(new.move_in, (new.move_in + make_interval(months => coalesce(new.months, 1)))::date);
  -- Rooms and beds take as many guests as free beds; a flat or studio takes one booking at a time.
  room_for := case when place.property_type in ('room', 'bed') then greatest(coalesce(place.available_beds, 1), 1) else 1 end;
  if taken >= room_for then
    raise exception 'dates_taken' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) Identity documents: full admins only (reviewers handle listings, not people's ids).
-- ---------------------------------------------------------------------------
drop policy if exists "Users and admins read identity checks" on public.identity_verifications;
create policy "Users and admins read identity checks" on public.identity_verifications for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_full_admin()));

drop policy if exists "Owners and admins read identity documents" on storage.objects;
create policy "Owners and admins read identity documents" on storage.objects for select to authenticated
  using (bucket_id = 'sakani-identity' and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_full_admin())));

create or replace function public.admin_review_identity(target_check uuid, approve boolean, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person uuid;
begin
  if not public.is_full_admin() then
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

-- ---------------------------------------------------------------------------
-- 6) release_ended_rentals: the daily job (no user) and admins only.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regprocedure('public.release_ended_rentals()') is not null then
    revoke all on function public.release_ended_rentals() from public, anon, authenticated;
  end if;
end;
$$;

-- An admin-only front door for the panel; the job calls the function itself.
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
  return public.release_ended_rentals();
end;
$$;

revoke all on function public.admin_release_ended_rentals() from public, anon;
grant execute on function public.admin_release_ended_rentals() to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Limits per sender. The sender is the signed-in account, or else a hash of the visitor's address
--    (never the address itself).
-- ---------------------------------------------------------------------------
create or replace function public.request_sender()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json as headers)
  select coalesce(
    (select auth.uid())::text,
    'ip:' || md5(coalesce(
      nullif(trim(split_part(h.headers ->> 'x-forwarded-for', ',', 1)), ''),
      h.headers ->> 'cf-connecting-ip',
      'unknown'
    ))
  )
  from h;
$$;

revoke all on function public.request_sender() from public, anon, authenticated;

alter table public.contact_messages add column if not exists sender text;
create index if not exists contact_messages_sender_idx on public.contact_messages (sender, created_at desc);

create or replace function public.contact_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sender := public.request_sender();
  new.created_at := now();
  if (select count(*) from public.contact_messages where sender = new.sender and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'message_limit' using errcode = 'P0001';
  end if;
  -- A backstop for the whole site, much higher than before.
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 minute') >= 100 then
    raise exception 'message_limit' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

alter table public.client_errors add column if not exists sender text;
create index if not exists client_errors_sender_idx on public.client_errors (sender, at desc);

create or replace function public.report_client_error(error_page text, error_message text, error_detail text, agent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  who text := public.request_sender();
begin
  if coalesce(trim(error_message), '') = '' then
    return;
  end if;
  if exists (select 1 from public.client_errors where message = left(error_message, 500) and at > now() - interval '1 hour') then
    return;
  end if;
  if (select count(*) from public.client_errors where sender = who and at > now() - interval '1 day') >= 20 then
    return;
  end if;
  if (select count(*) from public.client_errors where at > now() - interval '1 day') >= 2000 then
    return;
  end if;
  insert into public.client_errors (user_id, page, message, detail, user_agent, sender)
  values ((select auth.uid()), left(coalesce(error_page, ''), 300), left(error_message, 500), left(coalesce(error_detail, ''), 2000), left(coalesce(agent, ''), 300), who);
end;
$$;

-- ---------------------------------------------------------------------------
-- The hourly job for unpaid bookings (if pg_cron is on).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sakani-expire-unpaid-bookings';
    perform cron.schedule('sakani-expire-unpaid-bookings', '17 * * * *', 'select public.expire_unpaid_bookings_job()');
  else
    raise notice 'pg_cron is not on: unpaid bookings expire when an admin opens Requests, and no longer block dates after 24 hours.';
  end if;
end;
$$;
