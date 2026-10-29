-- Sakani: upfront payment by InstaPay, refunds within 24 hours, host payouts, chat with the Sakani team,
-- richer profiles, studios, and demo listings.
--   1) fees: guest 8%, host 10% of one month's rent, no minimum; InstaPay only for new payments
--   2) studios
--   3) demo listings (is_demo) + admin seed / clear
--   4) bookings: the guest pays first month + 8% right after booking; Sakani holds it, refunds within 24h
--      on a problem, and pays the host rent − 10% after move-in
--   5) chat: every user talks only with the Sakani team
--   6) richer profiles, avatars, public profile
-- Run once in the Supabase SQL Editor, after 20261101000000_sakani_hosts_guests.sql. Safe to run again.

-- ---------------------------------------------------------------------------
-- 1) Fees
-- ---------------------------------------------------------------------------
update public.app_settings set fee_percent = 10, fee_minimum = 0, student_fee_percent = 8, student_fee_minimum = 0 where id = 1;
alter table public.app_settings alter column fee_percent set default 10;
alter table public.app_settings alter column fee_minimum set default 0;
alter table public.app_settings alter column student_fee_percent set default 8;
alter table public.app_settings alter column student_fee_minimum set default 0;

-- ---------------------------------------------------------------------------
-- 2) Studios
-- ---------------------------------------------------------------------------
alter table public.properties drop constraint if exists properties_property_type_check;
alter table public.properties add constraint properties_property_type_check check (property_type in ('room', 'apartment', 'bed', 'studio'));
create index if not exists properties_status_type_created_idx on public.properties (status, property_type, created_at desc);

-- ---------------------------------------------------------------------------
-- 3) Demo listings
-- ---------------------------------------------------------------------------
alter table public.properties add column if not exists is_demo boolean not null default false;
create index if not exists properties_demo_idx on public.properties (is_demo) where is_demo;

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

create or replace function public.admin_seed_demo(how_many integer default 2000)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  places text[][] := array[
    ['Cairo', 'Nasr City', 'مدينة نصر'], ['Cairo', 'Maadi', 'المعادي'], ['Cairo', 'Heliopolis', 'مصر الجديدة'],
    ['Cairo', 'New Cairo', 'القاهرة الجديدة'], ['Cairo', 'Shubra', 'شبرا'], ['Cairo', 'Abbassia', 'العباسية'],
    ['Giza', 'Dokki', 'الدقي'], ['Giza', 'Mohandessin', 'المهندسين'], ['Giza', 'Haram', 'الهرم'],
    ['Giza', 'Faisal', 'فيصل'], ['Giza', '6th of October', '6 أكتوبر'], ['Giza', 'Sheikh Zayed', 'الشيخ زايد'],
    ['Alexandria', 'Smouha', 'سموحة'], ['Alexandria', 'Sidi Gaber', 'سيدي جابر'], ['Alexandria', 'Miami', 'ميامي'],
    ['Dakahlia', 'Mansoura', 'المنصورة'], ['Gharbia', 'Tanta', 'طنطا'], ['Sharqia', 'Zagazig', 'الزقازيق'],
    ['Qalyubia', 'Banha', 'بنها'], ['Monufia', 'Shibin El Kom', 'شبين الكوم'], ['Assiut', 'Assiut', 'أسيوط'],
    ['Minya', 'Minya', 'المنيا'], ['Ismailia', 'Ismailia', 'الإسماعيلية'], ['Port Said', 'Port Said', 'بورسعيد'],
    ['Suez', 'Suez', 'السويس'], ['Fayoum', 'Fayoum', 'الفيوم'], ['Beni Suef', 'Beni Suef', 'بني سويف'],
    ['Sohag', 'Sohag', 'سوهاج'], ['Aswan', 'Aswan', 'أسوان'], ['Luxor', 'Luxor', 'الأقصر']
  ];
  photos text[] := array[
    'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=900',
    'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=900',
    'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900',
    'https://images.unsplash.com/photo-1494526585095-c41746248156?w=900',
    'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=900',
    'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900',
    'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900',
    'https://images.unsplash.com/photo-1556020685-ae41abfc9365?w=900',
    'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=900',
    'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=900',
    'https://images.unsplash.com/photo-1540518614846-7eded433c457?w=900',
    'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=900',
    'https://images.unsplash.com/photo-1567767292278-a4f21aa2d36e?w=900',
    'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=900',
    'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=900',
    'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900',
    'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=900',
    'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=900',
    'https://images.unsplash.com/photo-1536376072261-38c75010e6c9?w=900',
    'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=900'
  ];
  types text[] := array['room', 'apartment', 'bed', 'studio'];
  type_ar text[] := array['أوضة', 'شقة', 'سرير', 'استوديو'];
  type_en text[] := array['Room', 'Apartment', 'Bed', 'Studio'];
  adjectives_ar text[] := array['هادية', 'واسعة', 'نضيفة', 'مريحة', 'جديدة', 'منوّرة'];
  adjectives_en text[] := array['Quiet', 'Spacious', 'Clean', 'Cosy', 'New', 'Bright'];
  i integer;
  p integer;
  ty integer;
  ad integer;
  ph integer;
  beds integer;
  price integer;
  checked boolean;
  made integer := 0;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  how_many := least(greatest(coalesce(how_many, 2000), 1), 5000);

  for i in 1..how_many loop
    p := 1 + floor(random() * array_length(places, 1))::integer;
    ty := 1 + floor(random() * 4)::integer;
    ad := 1 + floor(random() * 6)::integer;
    ph := 1 + floor(random() * array_length(photos, 1))::integer;
    beds := case types[ty] when 'apartment' then 2 + floor(random() * 3)::integer when 'bed' then 2 + floor(random() * 3)::integer else 1 end;
    price := case types[ty]
      when 'bed' then 1500 + floor(random() * 25)::integer * 100
      when 'room' then 2500 + floor(random() * 40)::integer * 100
      when 'studio' then 4000 + floor(random() * 60)::integer * 100
      else 6000 + floor(random() * 90)::integer * 100 end;
    checked := random() < 0.3;

    insert into public.properties (
      owner_id, title_ar, title_en, description_ar, description_en, governorate, area, gender, property_type,
      monthly_price, deposit, available_beds, total_beds, wifi, air_conditioning, security,
      whatsapp_number, image_url, image_urls, status, verified, verified_at, is_demo, created_at
    ) values (
      (select auth.uid()),
      type_ar[ty] || ' ' || adjectives_ar[ad] || ' في ' || places[p][3],
      adjectives_en[ad] || ' ' || lower(type_en[ty]) || ' in ' || places[p][2],
      'إعلان تجريبي لعرض شكل الموقع. ' || type_ar[ty] || ' ' || adjectives_ar[ad] || ' في ' || places[p][3] || '، قريبة من المواصلات والمحلات.',
      'Demo listing to preview the site. A ' || lower(adjectives_en[ad]) || ' ' || lower(type_en[ty]) || ' in ' || places[p][2] || ', close to transport and shops.',
      places[p][1], places[p][2],
      case when random() < 0.5 then 'male' else 'female' end,
      types[ty], price, (price / 2 / 100) * 100,
      1 + floor(random() * beds)::integer, beds,
      random() < 0.85, random() < 0.6, random() < 0.5,
      '01000000000',
      photos[ph],
      array[photos[ph], photos[1 + (ph % array_length(photos, 1))], photos[1 + ((ph + 4) % array_length(photos, 1))]],
      'approved', checked, case when checked then now() end, true,
      now() - (random() * interval '60 days')
    );
    made := made + 1;
  end loop;
  return made;
end;
$$;

create or replace function public.admin_clear_demo()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.properties where is_demo;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.admin_seed_demo(integer) from public, anon;
revoke all on function public.admin_clear_demo() from public, anon;
grant execute on function public.admin_seed_demo(integer) to authenticated;
grant execute on function public.admin_clear_demo() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Bookings with upfront payment
-- ---------------------------------------------------------------------------
alter table public.rental_fees add column if not exists kind text not null default 'fee';
alter table public.rental_fees drop constraint if exists rental_fees_kind_check;
alter table public.rental_fees add constraint rental_fees_kind_check check (kind in ('fee', 'upfront'));
alter table public.rental_fees add column if not exists rent_amount integer;
alter table public.rental_fees add column if not exists fee_amount integer;
alter table public.rental_fees drop constraint if exists rental_fees_status_check;
alter table public.rental_fees add constraint rental_fees_status_check check (status in ('due', 'submitted', 'paid', 'waived', 'refunded'));

alter table public.listing_requests add column if not exists host_id uuid references auth.users (id) on delete set null;
alter table public.listing_requests add column if not exists fee_id uuid references public.rental_fees (id) on delete set null;
alter table public.listing_requests add column if not exists rent_amount integer;
alter table public.listing_requests add column if not exists guest_fee integer;
alter table public.listing_requests add column if not exists host_fee integer;
alter table public.listing_requests add column if not exists total_amount integer;
alter table public.listing_requests add column if not exists payout_amount integer;
alter table public.listing_requests add column if not exists host_decision text not null default 'pending';
alter table public.listing_requests drop constraint if exists listing_requests_host_decision_check;
alter table public.listing_requests add constraint listing_requests_host_decision_check check (host_decision in ('pending', 'accepted', 'declined'));
alter table public.listing_requests add column if not exists host_decided_at timestamptz;
alter table public.listing_requests add column if not exists paid_at timestamptz;
alter table public.listing_requests add column if not exists moved_in_at timestamptz;
alter table public.listing_requests add column if not exists problem_note text check (problem_note is null or char_length(problem_note) <= 1000);
alter table public.listing_requests add column if not exists problem_at timestamptz;
alter table public.listing_requests add column if not exists refund_due_at timestamptz;
alter table public.listing_requests add column if not exists refund_reference text check (refund_reference is null or char_length(refund_reference) <= 64);
alter table public.listing_requests add column if not exists refunded_at timestamptz;
alter table public.listing_requests add column if not exists payout_reference text check (payout_reference is null or char_length(payout_reference) <= 64);
alter table public.listing_requests add column if not exists paid_out_at timestamptz;

create index if not exists listing_requests_host_idx on public.listing_requests (host_id, created_at desc);
create index if not exists listing_requests_fee_idx on public.listing_requests (fee_id);

-- Old visit-request statuses move to the new booking statuses.
alter table public.listing_requests drop constraint if exists listing_requests_status_check;
update public.listing_requests set status = 'completed' where status = 'rented';
update public.listing_requests set status = 'cancelled' where status in ('new', 'contacted', 'visit', 'closed');
alter table public.listing_requests alter column status set default 'pending_payment';
alter table public.listing_requests add constraint listing_requests_status_check
  check (status in ('pending_payment', 'payment_review', 'confirmed', 'moved_in', 'completed', 'refund_pending', 'refunded', 'cancelled'));

-- Bookings are made only through guest_create_booking (no direct inserts).
drop policy if exists "Signed-in guests can book" on public.listing_requests;
revoke insert on public.listing_requests from anon, authenticated;
drop function if exists public.admin_close_request(uuid);
drop function if exists public.guest_cancel_booking(uuid);

-- Works out the booking's status from the payment and the host's answer.
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
      update public.listing_requests set status = 'confirmed', paid_at = coalesce(paid_at, now()) where id = b.id;
      perform set_config('sakani.owner_action', 'on', true);
      update public.properties set status = 'paused' where id = b.listing_id and status = 'approved';
      perform set_config('sakani.owner_action', 'off', true);
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

-- When the upfront payment changes (sent, received, not received), the booking follows.
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
      perform public.booking_refresh(booking);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists rental_fees_sync_booking on public.rental_fees;
create trigger rental_fees_sync_booking
  after update on public.rental_fees
  for each row execute function public.rental_fees_sync_booking();

-- New payments are by InstaPay only.
create or replace function public.submit_payment_by_token(token uuid, pay_method text, pay_reference text, pay_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pay_method <> 'instapay' then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(pay_reference, ''))) not between 3 and 64 then
    raise exception 'invalid_reference' using errcode = 'P0001';
  end if;
  if coalesce(pay_phone, '') !~ '^[+0-9 ()-]{8,20}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  update public.rental_fees
  set status = 'submitted', method = pay_method, reference = trim(pay_reference), payer_phone = trim(pay_phone), submitted_at = now()
  where pay_token = token and status = 'due';

  if not found then
    raise exception 'fee_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- The payment page also shows the breakdown of an upfront payment.
drop function if exists public.fee_by_token(uuid);
create or replace function public.fee_by_token(token uuid)
returns table (
  amount integer,
  status text,
  payer text,
  kind text,
  rent_amount integer,
  fee_amount integer,
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
  select f.amount, f.status, f.payer, f.kind, f.rent_amount, f.fee_amount, f.listing_id, f.listing_title, f.monthly_price,
         f.method, f.submitted_at, f.decided_at, f.admin_note
  from public.rental_fees f
  where f.pay_token = token;
$$;

revoke all on function public.fee_by_token(uuid) from public;
grant execute on function public.fee_by_token(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5) Chat: every user talks only with the Sakani team
-- ---------------------------------------------------------------------------
create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  last_message_at timestamptz not null default now(),
  user_last_read timestamptz not null default now(),
  team_last_read timestamptz not null default to_timestamp(0),
  created_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads (id) on delete cascade,
  sender_id uuid references auth.users (id) on delete set null,
  from_team boolean not null default false,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  booking_id uuid references public.listing_requests (id) on delete set null,
  listing_id uuid references public.properties (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists support_threads_last_idx on public.support_threads (last_message_at desc);
create index if not exists support_messages_thread_idx on public.support_messages (thread_id, created_at);
create index if not exists support_messages_sender_idx on public.support_messages (sender_id, created_at desc);
create index if not exists support_messages_booking_idx on public.support_messages (booking_id);
create index if not exists support_messages_listing_idx on public.support_messages (listing_id);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
revoke all on public.support_threads, public.support_messages from anon;
grant select on public.support_threads to authenticated;
grant select, insert on public.support_messages to authenticated;

drop policy if exists "Users read their thread" on public.support_threads;
create policy "Users read their thread"
  on public.support_threads for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "Users read their messages" on public.support_messages;
create policy "Users read their messages"
  on public.support_messages for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.support_threads t where t.id = thread_id and t.user_id = (select auth.uid()))
  );

drop policy if exists "Users and the team send messages" on public.support_messages;
create policy "Users and the team send messages"
  on public.support_messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      (from_team = false and exists (select 1 from public.support_threads t where t.id = thread_id and t.user_id = (select auth.uid())))
      or (from_team = true and (select public.is_admin()))
    )
  );

grant delete on public.support_threads, public.support_messages to authenticated;

drop policy if exists "Admins delete messages" on public.support_messages;
create policy "Admins delete messages"
  on public.support_messages for delete to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins delete threads" on public.support_threads;
create policy "Admins delete threads"
  on public.support_threads for delete to authenticated
  using ((select public.is_admin()));

-- Flood guard and thread timestamps.
create or replace function public.support_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.support_messages where sender_id = new.sender_id and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'message_limit' using errcode = 'P0001';
  end if;
  new.created_at := now();
  new.body := trim(new.body);
  if new.from_team then
    update public.support_threads set last_message_at = now(), team_last_read = now() where id = new.thread_id;
  else
    update public.support_threads set last_message_at = now(), user_last_read = now() where id = new.thread_id;
  end if;
  return new;
end;
$$;

drop trigger if exists support_messages_guard on public.support_messages;
create trigger support_messages_guard
  before insert on public.support_messages
  for each row execute function public.support_messages_guard();

-- The signed-in user's thread with the team (made on first use).
create or replace function public.my_support_thread()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread uuid;
begin
  if (select auth.uid()) is null or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'account_required' using errcode = '42501';
  end if;
  insert into public.support_threads (user_id) values ((select auth.uid())) on conflict (user_id) do nothing;
  select id into thread from public.support_threads where user_id = (select auth.uid());
  return thread;
end;
$$;

-- Admin: open (or make) a user's thread, e.g. to message a host about a booking.
create or replace function public.team_thread_for(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  thread uuid;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  insert into public.support_threads (user_id, user_last_read) values (target_user, to_timestamp(0)) on conflict (user_id) do nothing;
  select id into thread from public.support_threads where user_id = target_user;
  return thread;
end;
$$;

-- Mark a thread read by the user, or by the team when an admin calls it.
create or replace function public.mark_thread_read(target_thread uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin() and not exists (select 1 from public.support_threads where id = target_thread and user_id = (select auth.uid())) then
    update public.support_threads set team_last_read = now() where id = target_thread;
  else
    update public.support_threads set user_last_read = now() where id = target_thread and user_id = (select auth.uid());
  end if;
end;
$$;

revoke all on function public.my_support_thread() from public, anon;
revoke all on function public.team_thread_for(uuid) from public, anon;
revoke all on function public.mark_thread_read(uuid) from public, anon;
grant execute on function public.my_support_thread() to authenticated;
grant execute on function public.team_thread_for(uuid) to authenticated;
grant execute on function public.mark_thread_read(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages') then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4b) Booking functions (after the chat tables, which they write to)
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
  g_fee integer;
  h_fee integer;
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

  select id, owner_id, title_en, title_ar, monthly_price, is_demo, status into listing from public.properties where id = target_listing;
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

  select * into settings from public.app_settings where id = 1;
  rent := listing.monthly_price;
  g_fee := round(rent * coalesce(settings.student_fee_percent, 8) / 100.0);
  h_fee := round(rent * coalesce(settings.fee_percent, 10) / 100.0);

  insert into public.rental_fees (listing_id, owner_id, listing_title, monthly_price, amount, payer, kind, rent_amount, fee_amount, payer_name, payer_contact, guest_id)
  values (listing.id, listing.owner_id, listing.title_en, rent, rent + g_fee, 'student', 'upfront', rent, g_fee, left(coalesce(nullif(who.full_name, ''), 'Guest'), 80), who.phone, me)
  returning id, pay_token into fee_row;

  insert into public.listing_requests (listing_id, listing_title, name, contact, note, locale, status, guest_id, host_id, fee_id,
    move_in, months, guests, rent_amount, guest_fee, host_fee, total_amount, payout_amount)
  values (listing.id, left(listing.title_en, 160), left(coalesce(nullif(who.full_name, ''), 'Guest'), 80), who.phone,
    nullif(left(trim(coalesce(guest_note, '')), 1000), ''), 'ar', 'pending_payment', me, listing.owner_id, fee_row.id,
    move_in_date, stay_months, coalesce(people, 1), rent, g_fee, h_fee, rent + g_fee, rent - h_fee)
  returning id into booking;

  update public.rental_fees set request_id = booking where id = fee_row.id;

  insert into public.support_threads (user_id) values (me) on conflict (user_id) do nothing;
  select id into thread from public.support_threads where user_id = me;
  insert into public.support_messages (thread_id, sender_id, from_team, body, booking_id, listing_id)
  values (thread, me, false, 'طلب حجز جديد / New booking: ' || listing.title_ar || ' — ' || move_in_date || ' — ' || stay_months || ' mo', booking, listing.id);

  return jsonb_build_object('booking_id', booking, 'pay_token', fee_row.pay_token, 'total', rent + g_fee, 'rent', rent, 'fee', g_fee);
end;
$$;

-- Host: accept or decline a booking on one of their places.
create or replace function public.host_decide_booking(target_booking uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listing_requests
  set host_decision = case when accept then 'accepted' else 'declined' end, host_decided_at = now()
  where id = target_booking and host_id = (select auth.uid()) and host_decision = 'pending'
    and status in ('pending_payment', 'payment_review');
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  perform public.booking_refresh(target_booking);
end;
$$;

-- Admin: record the host's answer given to the team (by phone or chat).
create or replace function public.admin_set_host_decision(target_booking uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.listing_requests
  set host_decision = case when accept then 'accepted' else 'declined' end, host_decided_at = now()
  where id = target_booking and status in ('pending_payment', 'payment_review');
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  perform public.booking_refresh(target_booking);
end;
$$;

-- Guest: cancel before paying.
create or replace function public.guest_cancel_booking(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listing_requests set status = 'cancelled'
  where id = target_booking and guest_id = (select auth.uid()) and status = 'pending_payment';
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  update public.rental_fees set status = 'waived', admin_note = 'Cancelled before payment'
  where id = (select fee_id from public.listing_requests where id = target_booking) and status = 'due';
end;
$$;

-- Guest: I've moved in (the host can then be paid).
create or replace function public.guest_confirm_move_in(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.listing_requests set status = 'moved_in', moved_in_at = now()
  where id = target_booking and guest_id = (select auth.uid()) and status = 'confirmed';
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Guest: something is wrong — the money comes back within 24 hours.
create or replace function public.guest_report_problem(target_booking uuid, note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(trim(coalesce(note, ''))) not between 5 and 1000 then
    raise exception 'invalid_note' using errcode = 'P0001';
  end if;
  update public.listing_requests
  set status = 'refund_pending', problem_note = trim(note), problem_at = now(), refund_due_at = now() + interval '24 hours'
  where id = target_booking and guest_id = (select auth.uid())
    and (status in ('payment_review', 'confirmed')
      or (status = 'moved_in' and now() <= (move_in::timestamptz + interval '48 hours')));
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Admin: the upfront transfer arrived (the booking confirms once the host has accepted).
create or replace function public.admin_confirm_booking_payment(target_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  update public.rental_fees set status = 'paid', decided_at = now(), decided_by = (select auth.uid())
  where id = (select fee_id from public.listing_requests where id = target_booking) and status in ('due', 'submitted');
  perform public.booking_refresh(target_booking);
end;
$$;

-- Admin: the money went back to the guest.
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
end;
$$;

-- Admin: the host was paid (rent − host fee) after the guest moved in.
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
  update public.listing_requests set status = 'completed', payout_reference = trim(transfer_reference), paid_out_at = now()
  where id = target_booking and status = 'moved_in';
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- Unpaid bookings expire after 24 hours; paid bookings the host hasn't answered in 24 hours are refunded.
create or replace function public.expire_unpaid_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer := 0;
  n integer;
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
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

-- Host: bookings on my places, without the guest's contact details.
create or replace function public.host_bookings()
returns table (
  id uuid, listing_id uuid, listing_title text, guest_first_name text, move_in date, months integer, guests integer,
  status text, host_decision text, rent_amount integer, host_fee integer, payout_amount integer, paid_out_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.listing_id, b.listing_title, split_part(b.name, ' ', 1), b.move_in, b.months, b.guests,
         b.status, b.host_decision, b.rent_amount, b.host_fee, b.payout_amount, b.paid_out_at, b.created_at
  from public.listing_requests b
  where b.host_id = (select auth.uid()) and b.status <> 'cancelled'
  order by b.created_at desc
  limit 200;
$$;

revoke all on function public.guest_create_booking(uuid, date, integer, integer, text) from public, anon;
revoke all on function public.host_decide_booking(uuid, boolean) from public, anon;
revoke all on function public.admin_set_host_decision(uuid, boolean) from public, anon;
revoke all on function public.guest_cancel_booking(uuid) from public, anon;
revoke all on function public.guest_confirm_move_in(uuid) from public, anon;
revoke all on function public.guest_report_problem(uuid, text) from public, anon;
revoke all on function public.admin_confirm_booking_payment(uuid) from public, anon;
revoke all on function public.admin_mark_refunded(uuid, text) from public, anon;
revoke all on function public.admin_mark_payout(uuid, text) from public, anon;
revoke all on function public.expire_unpaid_bookings() from public, anon;
revoke all on function public.host_bookings() from public, anon;
grant execute on function public.guest_create_booking(uuid, date, integer, integer, text) to authenticated;
grant execute on function public.host_decide_booking(uuid, boolean) to authenticated;
grant execute on function public.admin_set_host_decision(uuid, boolean) to authenticated;
grant execute on function public.guest_cancel_booking(uuid) to authenticated;
grant execute on function public.guest_confirm_move_in(uuid) to authenticated;
grant execute on function public.guest_report_problem(uuid, text) to authenticated;
grant execute on function public.admin_confirm_booking_payment(uuid) to authenticated;
grant execute on function public.admin_mark_refunded(uuid, text) to authenticated;
grant execute on function public.admin_mark_payout(uuid, text) to authenticated;
grant execute on function public.expire_unpaid_bookings() to authenticated;
grant execute on function public.host_bookings() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) Richer profiles
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists avatar_url text check (avatar_url is null or char_length(avatar_url) <= 500);
alter table public.profiles add column if not exists bio text not null default '' check (char_length(bio) <= 500);
alter table public.profiles add column if not exists governorate text not null default '' check (char_length(governorate) <= 40);
alter table public.profiles add column if not exists gender text check (gender is null or gender in ('male', 'female'));
alter table public.profiles add column if not exists occupation text not null default '' check (char_length(occupation) <= 80);
alter table public.profiles add column if not exists languages text[] not null default '{}' check (cardinality(languages) <= 6);
alter table public.profiles add column if not exists instapay_address text not null default '' check (char_length(instapay_address) <= 80);
alter table public.profiles add column if not exists id_verified boolean not null default false;

-- Only admins can mark an identity as checked; users can't change it themselves.
create or replace function public.profiles_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  new.updated_at := now();
  if not public.is_admin() then
    new.id_verified := old.id_verified;
  end if;
  return new;
end;
$$;

drop policy if exists "Admins update profiles" on public.profiles;
create policy "Admins update profiles"
  on public.profiles for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- What anyone may see about a user (no phone, email or InstaPay).
create or replace function public.public_profile(target_user uuid)
returns table (
  id uuid, first_name text, avatar_url text, bio text, governorate text, occupation text, languages text[],
  role text, member_since timestamptz, id_verified boolean, places integer, completed_stays integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, split_part(p.full_name, ' ', 1), p.avatar_url, p.bio, p.governorate, p.occupation, p.languages,
         p.role, p.created_at, p.id_verified,
         (select count(*)::integer from public.properties x where x.owner_id = p.id and x.status = 'approved' and not x.is_demo),
         (select count(*)::integer from public.listing_requests b where (b.host_id = p.id or b.guest_id = p.id) and b.status in ('moved_in', 'completed'))
  from public.profiles p
  where p.id = target_user;
$$;

revoke all on function public.public_profile(uuid) from public;
grant execute on function public.public_profile(uuid) to anon, authenticated;

-- Profile photos: public to view, each user uploads only into their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sakani-avatars', 'sakani-avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view avatars" on storage.objects;
create policy "Public can view avatars"
  on storage.objects for select
  using (bucket_id = 'sakani-avatars');

drop policy if exists "Users upload their avatar" on storage.objects;
create policy "Users upload their avatar"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'sakani-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users replace their avatar" on storage.objects;
create policy "Users replace their avatar"
  on storage.objects for update to authenticated
  using (bucket_id = 'sakani-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "Users delete their avatar" on storage.objects;
create policy "Users delete their avatar"
  on storage.objects for delete to authenticated
  using (bucket_id = 'sakani-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
