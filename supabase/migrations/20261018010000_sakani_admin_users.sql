create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

grant select on public.admin_users to authenticated;

drop policy if exists "Admins can read their own membership" on public.admin_users;
create policy "Admins can read their own membership"
  on public.admin_users for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Admins can read all property submissions" on public.properties;
create policy "Admins can read all property submissions"
  on public.properties for select to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where user_id = (select auth.uid())
    )
  );

drop policy if exists "Admins can review property submissions" on public.properties;
create policy "Admins can review property submissions"
  on public.properties for update to authenticated
  using (
    exists (
      select 1
      from public.admin_users
      where user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.admin_users
      where user_id = (select auth.uid())
    )
  );

create index if not exists properties_status_created_at_idx
  on public.properties (status, created_at desc);
