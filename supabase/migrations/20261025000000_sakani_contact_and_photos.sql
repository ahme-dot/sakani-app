-- 1) Contact messages from the site's "Contact us" form, read by admins in the Inbox.
-- 2) Owners can manage photos of listings they received from their guest session.
-- Safe to run more than once.

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text check (name is null or char_length(name) <= 80),
  contact text not null check (char_length(contact) between 5 and 120),
  topic text not null check (topic in ('student', 'owner', 'other')),
  message text not null check (char_length(message) between 10 and 2000),
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users (id) on delete set null
);

create index if not exists contact_messages_status_created_idx on public.contact_messages (status, created_at desc);

alter table public.contact_messages enable row level security;

grant insert on public.contact_messages to anon, authenticated;
grant select, update, delete on public.contact_messages to authenticated;

drop policy if exists "Anyone can send a contact message" on public.contact_messages;
create policy "Anyone can send a contact message"
  on public.contact_messages for insert to anon, authenticated
  with check (status = 'open' and closed_at is null and closed_by is null);

drop policy if exists "Admins can read contact messages" on public.contact_messages;
create policy "Admins can read contact messages"
  on public.contact_messages for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can update contact messages" on public.contact_messages;
create policy "Admins can update contact messages"
  on public.contact_messages for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete contact messages" on public.contact_messages;
create policy "Admins can delete contact messages"
  on public.contact_messages for delete to authenticated
  using ((select public.is_admin()));

-- Flood guard: at most 20 messages per minute across the whole site.
create or replace function public.contact_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.contact_messages where created_at > now() - interval '1 minute') >= 20 then
    raise exception 'message_limit' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists contact_messages_guard on public.contact_messages;
create trigger contact_messages_guard
  before insert on public.contact_messages
  for each row execute function public.contact_messages_guard();

-- Photos uploaded during a guest session live in that guest's folder. After the listings move
-- to the owner's account (claim_listing_transfer), let the owner replace or delete those photos too.
-- listing_transfers is unreadable to users, so the check runs inside a security-definer function.
create or replace function public.owns_claimed_guest_folder(folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.listing_transfers t
    where t.claimed_by = (select auth.uid())
      and t.from_user::text = folder
  );
$$;

revoke all on function public.owns_claimed_guest_folder(text) from public, anon;
grant execute on function public.owns_claimed_guest_folder(text) to authenticated;

drop policy if exists "Owners can delete photos from their claimed guest session" on storage.objects;
create policy "Owners can delete photos from their claimed guest session"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sakani-listings'
    and (select public.owns_claimed_guest_folder((storage.foldername(name))[1]))
  );
