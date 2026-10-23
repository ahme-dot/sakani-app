-- Sakani across Egypt: every listing has a governorate (existing listings were all in Giza).
-- The neighbourhood ("area") becomes free text written by the owner, so it gets sensible length limits.

alter table public.properties
  add column if not exists governorate text not null default 'Giza';

alter table public.properties drop constraint if exists properties_governorate_check;
alter table public.properties
  add constraint properties_governorate_check check (char_length(governorate) between 2 and 40);

alter table public.properties drop constraint if exists properties_area_length_check;
alter table public.properties
  add constraint properties_area_length_check check (char_length(area) between 2 and 60);

alter table public.properties drop constraint if exists properties_university_length_check;
alter table public.properties
  add constraint properties_university_length_check check (char_length(university) between 2 and 80);

-- The public feed filters published listings by governorate.
create index if not exists properties_status_governorate_idx on public.properties (status, governorate, created_at desc);
