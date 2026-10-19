create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  title_ar text not null check (char_length(title_ar) between 5 and 120),
  title_en text not null check (char_length(title_en) between 5 and 120),
  description_ar text not null check (char_length(description_ar) between 20 and 2000),
  description_en text not null check (char_length(description_en) between 20 and 2000),
  area text not null,
  university text not null,
  gender text not null check (gender in ('male', 'female', 'mixed')),
  property_type text not null check (property_type in ('room', 'apartment', 'bed')),
  monthly_price integer not null check (monthly_price between 1 and 1000000),
  deposit integer not null default 0 check (deposit between 0 and 1000000),
  furnished boolean not null default false,
  wifi boolean not null default false,
  air_conditioning boolean not null default false,
  security boolean not null default false,
  available_beds integer not null default 1 check (available_beds between 1 and 100),
  total_beds integer not null default 1 check (total_beds between 1 and 100),
  walking_distance_minutes integer not null default 0 check (walking_distance_minutes between 0 and 300),
  whatsapp_number text not null check (char_length(whatsapp_number) between 8 and 20),
  image_url text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  constraint available_beds_not_above_total check (available_beds <= total_beds)
);

create index if not exists properties_approved_created_at_idx
  on public.properties (created_at desc)
  where status = 'approved';

create index if not exists properties_owner_created_at_idx
  on public.properties (owner_id, created_at desc);

alter table public.properties enable row level security;

grant select on public.properties to anon, authenticated;
grant insert, update, delete on public.properties to authenticated;

drop policy if exists "Anyone can read approved properties" on public.properties;
create policy "Anyone can read approved properties"
  on public.properties for select
  using (status = 'approved');

drop policy if exists "Owners can read their properties" on public.properties;
create policy "Owners can read their properties"
  on public.properties for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "Owners can submit pending properties" on public.properties;
create policy "Owners can submit pending properties"
  on public.properties for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and status = 'pending'
  );

drop policy if exists "Owners can update their pending properties" on public.properties;
create policy "Owners can update their pending properties"
  on public.properties for update to authenticated
  using (
    (select auth.uid()) = owner_id
    and status = 'pending'
  )
  with check (
    (select auth.uid()) = owner_id
    and status = 'pending'
  );

drop policy if exists "Owners can delete their pending properties" on public.properties;
create policy "Owners can delete their pending properties"
  on public.properties for delete to authenticated
  using (
    (select auth.uid()) = owner_id
    and status = 'pending'
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'sakani-listings',
  'sakani-listings',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view property photos" on storage.objects;
create policy "Public can view property photos"
  on storage.objects for select
  using (bucket_id = 'sakani-listings');

drop policy if exists "Owners can upload their property photos" on storage.objects;
create policy "Owners can upload their property photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sakani-listings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owners can update their property photos" on storage.objects;
create policy "Owners can update their property photos"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'sakani-listings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'sakani-listings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Owners can delete their property photos" on storage.objects;
create policy "Owners can delete their property photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sakani-listings'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
