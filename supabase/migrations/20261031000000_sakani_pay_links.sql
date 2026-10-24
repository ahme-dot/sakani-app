-- Every fee (owner or student) gets a private payment link, so all payments happen on the site.
-- The link holds an unguessable token; anyone with the link can see that one fee and send its transfer
-- details, nothing else. Safe to run more than once.

alter table public.rental_fees
  add column if not exists pay_token uuid not null default gen_random_uuid();

create unique index if not exists rental_fees_pay_token_idx on public.rental_fees (pay_token);

-- What the payment page shows for one link (no owner or student contact details).
create or replace function public.fee_by_token(token uuid)
returns table (
  amount integer,
  status text,
  payer text,
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
  select f.amount, f.status, f.payer, f.listing_id, f.listing_title, f.monthly_price, f.method, f.submitted_at, f.decided_at, f.admin_note
  from public.rental_fees f
  where f.pay_token = token;
$$;

-- Send the transfer details for the fee behind a link (only while it is due).
create or replace function public.submit_payment_by_token(token uuid, pay_method text, pay_reference text, pay_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pay_method not in ('instapay', 'vodafone_cash') then
    raise exception 'invalid_method' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(pay_reference, ''))) not between 3 and 64 then
    raise exception 'invalid_reference' using errcode = 'P0001';
  end if;
  if coalesce(pay_phone, '') !~ '^[+0-9 ()-]{8,20}$' then
    raise exception 'invalid_phone' using errcode = 'P0001';
  end if;

  update public.rental_fees
  set status = 'submitted',
      method = pay_method,
      reference = trim(pay_reference),
      payer_phone = trim(pay_phone),
      submitted_at = now()
  where pay_token = token
    and status = 'due';

  if not found then
    raise exception 'fee_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.fee_by_token(uuid) from public;
revoke all on function public.submit_payment_by_token(uuid, text, text, text) from public;
grant execute on function public.fee_by_token(uuid) to anon, authenticated;
grant execute on function public.submit_payment_by_token(uuid, text, text, text) to anon, authenticated;
