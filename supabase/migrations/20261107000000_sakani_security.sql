-- Sakani security: photos can't be listed by visitors, error reports can't be flooded as easily, and
-- an admin who has set up a second factor (an authenticator app) must use it for every admin action.
-- Safe to run more than once. Run it before deploying the code that uses it.

-- ---------------------------------------------------------------------------
-- 1) Photo stores: the buckets stay public, so every photo still opens by its link, but nobody can
--    list a bucket's files any more (that showed photos of unpublished listings and people's ids).
--    Owners still see their own folder; admins see listing photos.
-- ---------------------------------------------------------------------------
drop policy if exists "Public can view property photos" on storage.objects;
drop policy if exists "Owners and admins see listing photos" on storage.objects;
create policy "Owners and admins see listing photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'sakani-listings'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or (select public.owns_claimed_guest_folder((storage.foldername(name))[1]))
      or (select public.is_admin())
    )
  );

drop policy if exists "Public can view avatars" on storage.objects;
drop policy if exists "Users see their own avatar files" on storage.objects;
create policy "Users see their own avatar files"
  on storage.objects for select to authenticated
  using (bucket_id = 'sakani-avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- 2) Error reports: a repeat within an hour is dropped, at most 200 a day are kept, and empty ones
--    are ignored, so a flood can't easily bury real errors.
-- ---------------------------------------------------------------------------
create or replace function public.report_client_error(error_page text, error_message text, error_detail text, agent text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(trim(error_message), '') = '' then
    return;
  end if;
  if exists (select 1 from public.client_errors where message = left(error_message, 500) and at > now() - interval '1 hour') then
    return;
  end if;
  if (select count(*) from public.client_errors where at > now() - interval '1 day') >= 200 then
    return;
  end if;
  insert into public.client_errors (user_id, page, message, detail, user_agent)
  values ((select auth.uid()), left(coalesce(error_page, ''), 300), left(error_message, 500), left(coalesce(error_detail, ''), 2000), left(coalesce(agent, ''), 300));
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Two-step sign-in for admins. Once an admin has a verified authenticator-app factor, their session
--    only counts as admin after the 6-digit code (assurance level aal2). Admins without one keep
--    working as before until they set it up.
-- ---------------------------------------------------------------------------
create or replace function public.admin_mfa_passed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors f
      where f.user_id = (select auth.uid()) and f.status = 'verified'
    );
$$;

revoke all on function public.admin_mfa_passed() from public;
grant execute on function public.admin_mfa_passed() to anon, authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()))
    and public.admin_mfa_passed();
$$;

create or replace function public.is_full_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admin_users where user_id = (select auth.uid()) and role = 'full')
    and public.admin_mfa_passed();
$$;
