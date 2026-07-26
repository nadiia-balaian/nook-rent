create table nook.agent_payment_mandates (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (length(idempotency_key) between 8 and 200),
  guest_profile_id uuid not null references nook.profiles(id),
  agent_address text not null check (length(agent_address) between 3 and 160),
  booking_id uuid not null unique references nook.bookings(id),
  quote_id uuid not null unique references nook.booking_quotes(id),
  token_id text not null check (length(token_id) between 3 and 120),
  maximum_deposit_atomic numeric(78, 0) not null check (maximum_deposit_atomic > 0),
  status text not null check (status in ('active', 'consumed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  operation_id uuid unique references nook.operations(id),
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (
      status = 'consumed'
      and operation_id is not null
      and consumed_at is not null
    )
    or (
      status <> 'consumed'
      and operation_id is null
      and consumed_at is null
    )
  )
);

create index agent_payment_mandates_active_expiry_idx
  on nook.agent_payment_mandates (expires_at)
  where status = 'active';

create or replace function nook.close_agent_payment_mandate_with_booking()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, nook, pg_temp
as $$
begin
  update nook.agent_payment_mandates
  set
    status = case when new.status = 'expired' then 'expired' else 'cancelled' end,
    updated_at = new.updated_at
  where booking_id = new.id
    and status = 'active';

  return new;
end;
$$;

create trigger close_agent_payment_mandate_with_booking
after update of status on nook.bookings
for each row
when (
  old.status is distinct from new.status
  and new.status in ('rejected', 'expired', 'cancelled')
)
execute function nook.close_agent_payment_mandate_with_booking();

alter table nook.agent_payment_mandates enable row level security;

revoke all on function nook.close_agent_payment_mandate_with_booking() from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function nook.close_agent_payment_mandate_with_booking() to service_role';
  end if;
end;
$$;
