-- Owner phone numbers become private: run AFTER the site version that no longer reads whatsapp_number
-- is live (it reads numbers through listing_private_contacts instead). Safe to run more than once.

-- Column privileges: visitors and signed-in users can read every column except whatsapp_number.
-- NOTE: a column added to properties later must be granted here too, or clients cannot read it.
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
