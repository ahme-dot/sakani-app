-- Owner accounts: move listings an owner created as a guest (anonymous session)
-- into the email/password account they sign up for or log in to. Safe to run more than once.
--
-- Flow: while still a guest, the browser calls create_listing_transfer() and keeps the token;
-- after signing in to the real account it calls claim_listing_transfer(token).
-- The token is an unguessable UUID that only the guest's own session can create.

create table if not exists public.listing_transfers (
  token uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz
);

-- No policies: the table is reachable only through the functions below.
alter table public.listing_transfers enable row level security;
revoke all on public.listing_transfers from anon, authenticated;

create index if not exists listing_transfers_from_user_idx on public.listing_transfers (from_user);

create or replace function public.create_listing_transfer()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_token uuid;
begin
  if (select auth.uid()) is null
     or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) = false then
    raise exception 'guest_session_required' using errcode = '42501';
  end if;

  delete from public.listing_transfers
  where from_user = (select auth.uid()) and claimed_at is null;

  insert into public.listing_transfers (from_user)
  values ((select auth.uid()))
  returning token into new_token;

  return new_token;
end;
$$;

-- Returns how many listings were moved (0 if the token is unknown, used or expired).
create or replace function public.claim_listing_transfer(transfer_token uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_user uuid;
  moved integer;
begin
  if (select auth.uid()) is null
     or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
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
  update public.properties set owner_id = (select auth.uid()) where owner_id = source_user;
  get diagnostics moved = row_count;
  perform set_config('sakani.listing_transfer', 'off', true);

  update public.listing_transfers
  set claimed_by = (select auth.uid()), claimed_at = now()
  where token = transfer_token;

  return moved;
end;
$$;

revoke all on function public.create_listing_transfer() from public, anon;
revoke all on function public.claim_listing_transfer(uuid) from public, anon;
grant execute on function public.create_listing_transfer() to authenticated;
grant execute on function public.claim_listing_transfer(uuid) to authenticated;

-- Same guard as before, plus the transfer exception above.
create or replace function public.properties_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent_count integer;
begin
  new.updated_at := now();

  if public.is_admin() or current_setting('sakani.listing_transfer', true) = 'on' then
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

    new.verified := false;
    new.rejection_reason := null;
    new.status := 'pending';
    new.created_at := now();
  else
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
    new.verified := false;
    new.rejection_reason := null;
    new.status := 'pending';
  end if;

  return new;
end;
$$;
