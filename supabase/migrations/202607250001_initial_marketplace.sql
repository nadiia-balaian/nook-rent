create extension if not exists pgcrypto;
create schema if not exists nook;

create table nook.profiles (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('host', 'guest', 'both')),
  public_ref text not null unique check (length(public_ref) between 3 and 120),
  created_at timestamptz not null default now()
);

create table nook.agent_bindings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references nook.profiles(id) on delete cascade,
  role_scope text not null check (role_scope in ('host', 'guest')),
  network text not null check (length(network) between 1 and 80),
  agent_address text not null check (length(agent_address) between 3 and 160),
  human_backed_verified boolean not null default false,
  human_verification_ref_hash text,
  human_verification_expires_at timestamptz,
  verification_summary jsonb not null default '{}'::jsonb
    check (jsonb_typeof(verification_summary) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (network, agent_address, role_scope)
);

create table nook.listings (
  id uuid primary key default gen_random_uuid(),
  host_profile_id uuid not null references nook.profiles(id),
  title text not null check (length(title) between 3 and 140),
  description text not null check (length(description) between 1 and 5000),
  city text not null check (length(city) between 1 and 120),
  neighborhood text not null default '',
  approximate_location_ref text not null,
  amenities text[] not null default '{}',
  house_rules text[] not null default '{}',
  settlement_token_id text not null check (length(settlement_token_id) between 3 and 120),
  nightly_rate_atomic numeric(78, 0) not null check (nightly_rate_atomic > 0),
  max_guests integer not null check (max_guests between 1 and 100),
  status text not null check (status in ('draft', 'published', 'paused', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nook.listing_approval_policies (
  listing_id uuid primary key references nook.listings(id) on delete cascade,
  automatic_approval_enabled boolean not null default false,
  minimum_rental_reputation_tier text not null default 'newcomer'
    check (minimum_rental_reputation_tier in ('newcomer', 'bronze', 'silver', 'gold')),
  version integer not null default 1 check (version > 0),
  updated_at timestamptz not null default now()
);

create table nook.availability_windows (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references nook.listings(id) on delete cascade,
  check_in date not null,
  check_out date not null,
  created_at timestamptz not null default now(),
  check (check_out > check_in),
  unique (listing_id, check_in, check_out)
);

create table nook.booking_quotes (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references nook.listings(id),
  guest_profile_id uuid not null references nook.profiles(id),
  check_in date not null,
  check_out date not null,
  settlement_token_id text not null,
  nightly_rate_atomic numeric(78, 0) not null check (nightly_rate_atomic > 0),
  stay_subtotal_atomic numeric(78, 0) not null check (stay_subtotal_atomic > 0),
  base_deposit_atomic numeric(78, 0) not null check (base_deposit_atomic > 0),
  quoted_deposit_atomic numeric(78, 0) not null check (quoted_deposit_atomic > 0),
  total_due_atomic numeric(78, 0) not null check (total_due_atomic > 0),
  reputation_tier text not null
    check (reputation_tier in ('newcomer', 'bronze', 'silver', 'gold')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((check_out - check_in) between 3 and 90),
  check (stay_subtotal_atomic = nightly_rate_atomic * (check_out - check_in)),
  check (total_due_atomic = stay_subtotal_atomic + quoted_deposit_atomic),
  check (expires_at > created_at)
);

create table nook.reservation_holds (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique check (length(request_id) between 8 and 200),
  listing_id uuid not null references nook.listings(id),
  guest_profile_id uuid not null references nook.profiles(id),
  quote_id uuid not null unique references nook.booking_quotes(id),
  check_in date not null,
  check_out date not null,
  status text not null check (status in ('active', 'converted', 'released', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((check_out - check_in) between 3 and 90),
  check (expires_at > created_at)
);

create table nook.booking_requests (
  id uuid primary key default gen_random_uuid(),
  hold_id uuid not null unique references nook.reservation_holds(id),
  listing_id uuid not null references nook.listings(id),
  guest_profile_id uuid not null references nook.profiles(id),
  approval_result text not null
    check (approval_result in ('host_review', 'auto_approved', 'approved', 'rejected')),
  approval_reason text,
  policy_version integer not null check (policy_version > 0),
  status text not null
    check (status in ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nook.bookings (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references nook.listings(id),
  host_profile_id uuid not null references nook.profiles(id),
  guest_profile_id uuid not null references nook.profiles(id),
  quote_id uuid not null unique references nook.booking_quotes(id),
  hold_id uuid not null unique references nook.reservation_holds(id),
  check_in date not null,
  check_out date not null,
  settlement_token_id text not null,
  stay_subtotal_atomic numeric(78, 0) not null check (stay_subtotal_atomic > 0),
  deposit_amount_atomic numeric(78, 0) not null check (deposit_amount_atomic > 0),
  status text not null check (
    status in (
      'request_received',
      'approval_pending',
      'awaiting_deposit',
      'confirmed',
      'checked_in',
      'checkout_pending',
      'completed',
      'rejected',
      'expired',
      'cancelled',
      'disputed'
    )
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((check_out - check_in) between 3 and 90)
);

create table nook.escrows (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references nook.bookings(id),
  token_id text not null,
  amount_atomic numeric(78, 0) not null check (amount_atomic > 0),
  status text not null check (
    status in ('pending', 'submitted', 'funded', 'release_pending', 'released', 'refunded', 'failed')
  ),
  funded_transaction_id text unique,
  release_transaction_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nook.payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references nook.bookings(id),
  payment_kind text not null check (payment_kind in ('deposit', 'booking', 'refund', 'release')),
  token_id text not null,
  amount_atomic numeric(78, 0) not null check (amount_atomic > 0),
  recipient_ref text not null,
  status text not null check (status in ('pending', 'submitted', 'confirmed', 'failed')),
  operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, payment_kind)
);

create table nook.operations (
  id uuid primary key default gen_random_uuid(),
  operation_kind text not null,
  idempotency_key text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  provider text not null,
  provider_transaction_id text unique,
  status text not null check (
    status in ('pending', 'reserved', 'submitted', 'confirmed', 'failed', 'reconciling')
  ),
  request_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_payload) = 'object'),
  provider_response jsonb,
  failure_code text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (operation_kind, idempotency_key)
);

alter table nook.payments
  add constraint payments_operation_id_fkey
  foreign key (operation_id) references nook.operations(id);

create table nook.rental_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text not null,
  subject_profile_id uuid not null references nook.profiles(id),
  booking_id uuid references nook.bookings(id),
  ruleset_version integer not null check (ruleset_version > 0),
  contribution_units integer not null,
  source text not null check (source in ('nook', 'hedera_hcs')),
  source_transaction_id text,
  source_sequence_number bigint,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create table nook.reputation_projections (
  profile_id uuid primary key references nook.profiles(id) on delete cascade,
  ruleset_version integer not null check (ruleset_version > 0),
  total_units integer not null default 0,
  tier text not null check (tier in ('newcomer', 'bronze', 'silver', 'gold')),
  completed_stays integer not null default 0 check (completed_stays >= 0),
  event_count integer not null default 0 check (event_count >= 0),
  last_event_id uuid references nook.rental_events(id),
  rebuilt_at timestamptz not null default now()
);

create index listings_search_idx on nook.listings (lower(city), status, max_guests);
create index availability_windows_listing_dates_idx
  on nook.availability_windows (listing_id, check_in, check_out);
create index reservation_holds_listing_dates_idx
  on nook.reservation_holds (listing_id, check_in, check_out)
  where status = 'active';
create index reservation_holds_expiry_idx
  on nook.reservation_holds (expires_at)
  where status = 'active';
create index bookings_listing_dates_idx
  on nook.bookings (listing_id, check_in, check_out);
create index operations_reconciliation_idx
  on nook.operations (status, next_attempt_at)
  where status in ('submitted', 'reconciling');
create index rental_events_profile_order_idx
  on nook.rental_events (subject_profile_id, occurred_at, id);
create unique index rental_events_source_order_idx
  on nook.rental_events (source_transaction_id, source_sequence_number)
  where source_transaction_id is not null and source_sequence_number is not null;

create or replace function nook.create_reservation_hold(
  p_request_id text,
  p_listing_id uuid,
  p_guest_profile_id uuid,
  p_quote_id uuid,
  p_check_in date,
  p_check_out date,
  p_expires_at timestamptz,
  p_now timestamptz
)
returns table (
  result_kind text,
  id uuid,
  request_id text,
  listing_id uuid,
  guest_profile_id uuid,
  quote_id uuid,
  check_in date,
  check_out date,
  status text,
  expires_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, nook, pg_temp
as $$
declare
  existing_hold nook.reservation_holds%rowtype;
  created_hold nook.reservation_holds%rowtype;
  quote_row nook.booking_quotes%rowtype;
  listing_status text;
begin
  if p_request_id is null or length(p_request_id) < 8 then
    raise exception using errcode = '22023', message = 'invalid_request_id';
  end if;

  if p_check_in is null or p_check_out is null or (p_check_out - p_check_in) not between 3 and 90 then
    raise exception using errcode = '22023', message = 'invalid_stay_range';
  end if;

  if p_now is null or p_expires_at is null or p_expires_at <= p_now then
    raise exception using errcode = '22023', message = 'invalid_hold_expiry';
  end if;

  select hold.*
  into existing_hold
  from nook.reservation_holds as hold
  where hold.request_id = p_request_id;

  if found then
    if existing_hold.listing_id <> p_listing_id
      or existing_hold.guest_profile_id <> p_guest_profile_id
      or existing_hold.quote_id <> p_quote_id
      or existing_hold.check_in <> p_check_in
      or existing_hold.check_out <> p_check_out
    then
      raise exception using errcode = '22023', message = 'idempotency_key_reused';
    end if;

    return query
    select
      'idempotent'::text,
      existing_hold.id,
      existing_hold.request_id,
      existing_hold.listing_id,
      existing_hold.guest_profile_id,
      existing_hold.quote_id,
      existing_hold.check_in,
      existing_hold.check_out,
      existing_hold.status,
      existing_hold.expires_at,
      existing_hold.created_at,
      existing_hold.updated_at;
    return;
  end if;

  select listing.status
  into listing_status
  from nook.listings as listing
  where listing.id = p_listing_id
  for update;

  if not found then
    raise exception using errcode = '22023', message = 'listing_not_found';
  end if;

  if listing_status <> 'published' then
    raise exception using errcode = '22023', message = 'listing_not_published';
  end if;

  select hold.*
  into existing_hold
  from nook.reservation_holds as hold
  where hold.request_id = p_request_id;

  if found then
    if existing_hold.listing_id <> p_listing_id
      or existing_hold.guest_profile_id <> p_guest_profile_id
      or existing_hold.quote_id <> p_quote_id
      or existing_hold.check_in <> p_check_in
      or existing_hold.check_out <> p_check_out
    then
      raise exception using errcode = '22023', message = 'idempotency_key_reused';
    end if;

    return query
    select
      'idempotent'::text,
      existing_hold.id,
      existing_hold.request_id,
      existing_hold.listing_id,
      existing_hold.guest_profile_id,
      existing_hold.quote_id,
      existing_hold.check_in,
      existing_hold.check_out,
      existing_hold.status,
      existing_hold.expires_at,
      existing_hold.created_at,
      existing_hold.updated_at;
    return;
  end if;

  update nook.reservation_holds as hold
  set
    status = 'expired',
    updated_at = p_now
  where hold.listing_id = p_listing_id
    and hold.status = 'active'
    and hold.expires_at <= p_now;

  select quote.*
  into quote_row
  from nook.booking_quotes as quote
  where quote.id = p_quote_id;

  if not found
    or quote_row.listing_id <> p_listing_id
    or quote_row.guest_profile_id <> p_guest_profile_id
    or quote_row.check_in <> p_check_in
    or quote_row.check_out <> p_check_out
  then
    raise exception using errcode = '22023', message = 'quote_mismatch';
  end if;

  if quote_row.expires_at <= p_now or p_expires_at > quote_row.expires_at then
    raise exception using errcode = '22023', message = 'quote_expired_or_too_short';
  end if;

  if not exists (
    select 1
    from nook.availability_windows as availability
    where availability.listing_id = p_listing_id
      and availability.check_in <= p_check_in
      and availability.check_out >= p_check_out
  ) then
    raise exception using errcode = '22023', message = 'outside_availability';
  end if;

  if exists (
    select 1
    from nook.reservation_holds as hold
    where hold.listing_id = p_listing_id
      and hold.status = 'active'
      and hold.expires_at > p_now
      and hold.check_in < p_check_out
      and p_check_in < hold.check_out
  ) or exists (
    select 1
    from nook.bookings as booking
    where booking.listing_id = p_listing_id
      and booking.status in (
        'request_received',
        'approval_pending',
        'awaiting_deposit',
        'confirmed',
        'checked_in',
        'checkout_pending',
        'disputed'
      )
      and booking.check_in < p_check_out
      and p_check_in < booking.check_out
  ) then
    return query
    select
      'conflict'::text,
      null::uuid,
      null::text,
      null::uuid,
      null::uuid,
      null::uuid,
      null::date,
      null::date,
      null::text,
      null::timestamptz,
      null::timestamptz,
      null::timestamptz;
    return;
  end if;

  insert into nook.reservation_holds (
    request_id,
    listing_id,
    guest_profile_id,
    quote_id,
    check_in,
    check_out,
    status,
    expires_at,
    created_at,
    updated_at
  )
  values (
    p_request_id,
    p_listing_id,
    p_guest_profile_id,
    p_quote_id,
    p_check_in,
    p_check_out,
    'active',
    p_expires_at,
    p_now,
    p_now
  )
  returning * into created_hold;

  return query
  select
    'created'::text,
    created_hold.id,
    created_hold.request_id,
    created_hold.listing_id,
    created_hold.guest_profile_id,
    created_hold.quote_id,
    created_hold.check_in,
    created_hold.check_out,
    created_hold.status,
    created_hold.expires_at,
    created_hold.created_at,
    created_hold.updated_at;
end;
$$;

create or replace function nook.expire_reservation_holds(
  p_now timestamptz,
  p_limit integer default 100
)
returns setof nook.reservation_holds
language plpgsql
security definer
set search_path = pg_catalog, nook, pg_temp
as $$
begin
  if p_now is null or p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'invalid_expiry_batch';
  end if;

  return query
  with candidates as (
    select hold.id
    from nook.reservation_holds as hold
    where hold.status = 'active'
      and hold.expires_at <= p_now
    order by hold.expires_at, hold.id
    for update skip locked
    limit p_limit
  )
  update nook.reservation_holds as hold
  set
    status = 'expired',
    updated_at = p_now
  from candidates
  where hold.id = candidates.id
  returning hold.*;
end;
$$;

revoke all on function nook.create_reservation_hold(
  text,
  uuid,
  uuid,
  uuid,
  date,
  date,
  timestamptz,
  timestamptz
) from public;
revoke all on function nook.expire_reservation_holds(timestamptz, integer) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema nook to service_role';
    execute 'grant execute on function nook.create_reservation_hold(text, uuid, uuid, uuid, date, date, timestamptz, timestamptz) to service_role';
    execute 'grant execute on function nook.expire_reservation_holds(timestamptz, integer) to service_role';
  end if;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'agent_bindings',
    'listings',
    'listing_approval_policies',
    'availability_windows',
    'booking_quotes',
    'reservation_holds',
    'booking_requests',
    'bookings',
    'escrows',
    'payments',
    'operations',
    'rental_events',
    'reputation_projections'
  ]
  loop
    execute format('alter table nook.%I enable row level security', table_name);
  end loop;
end;
$$;
