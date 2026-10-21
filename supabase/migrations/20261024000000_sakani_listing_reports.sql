-- Listing reports: visitors flag scams or problems on published listings; admins review them.
-- Safe to run more than once.

create table if not exists public.listing_reports (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.properties (id) on delete cascade,
  reason text not null check (reason in ('scam', 'unavailable', 'wrong_info', 'inappropriate', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  contact text check (contact is null or char_length(contact) <= 120),
  status text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null
);

create index if not exists listing_reports_status_created_idx on public.listing_reports (status, created_at desc);
create index if not exists listing_reports_listing_idx on public.listing_reports (listing_id);

alter table public.listing_reports enable row level security;

grant insert on public.listing_reports to anon, authenticated;
grant select, update, delete on public.listing_reports to authenticated;

-- Anyone may report a published listing; review fields can't be set by the reporter.
drop policy if exists "Anyone can report published listings" on public.listing_reports;
create policy "Anyone can report published listings"
  on public.listing_reports for insert to anon, authenticated
  with check (
    status = 'open'
    and resolved_at is null
    and resolved_by is null
    and exists (select 1 from public.properties p where p.id = listing_id and p.status = 'approved')
  );

drop policy if exists "Admins can read reports" on public.listing_reports;
create policy "Admins can read reports"
  on public.listing_reports for select to authenticated
  using ((select public.is_admin()));

drop policy if exists "Admins can review reports" on public.listing_reports;
create policy "Admins can review reports"
  on public.listing_reports for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

drop policy if exists "Admins can delete reports" on public.listing_reports;
create policy "Admins can delete reports"
  on public.listing_reports for delete to authenticated
  using ((select public.is_admin()));

-- Flood guard: caps reports per listing per day and overall per minute.
create or replace function public.listing_reports_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.listing_reports
      where listing_id = new.listing_id and created_at > now() - interval '1 day') >= 20 then
    raise exception 'report_limit' using errcode = 'P0001';
  end if;

  if (select count(*) from public.listing_reports where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'report_limit' using errcode = 'P0001';
  end if;

  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists listing_reports_guard on public.listing_reports;
create trigger listing_reports_guard
  before insert on public.listing_reports
  for each row execute function public.listing_reports_guard();
