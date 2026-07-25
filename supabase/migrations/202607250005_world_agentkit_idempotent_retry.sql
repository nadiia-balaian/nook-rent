create or replace function nook.create_human_backed_reservation_hold(
  p_request_id text,
  p_listing_id uuid,
  p_guest_profile_id uuid,
  p_quote_id uuid,
  p_check_in date,
  p_check_out date,
  p_expires_at timestamptz,
  p_now timestamptz,
  p_provider text,
  p_agent_address text,
  p_human_reference_hash text,
  p_nonce text
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
  existing_authorization nook.human_backed_authorizations%rowtype;
  existing_nonce_authorization nook.human_backed_authorizations%rowtype;
  existing_binding nook.agent_bindings%rowtype;
  created_authorization nook.human_backed_authorizations%rowtype;
  hold_result record;
  normalized_agent_address text := lower(p_agent_address);
begin
  if p_provider <> 'world_agentkit' then
    raise exception using errcode = '22023', message = 'unsupported_authorization_provider';
  end if;

  if normalized_agent_address is null or length(normalized_agent_address) < 3 then
    raise exception using errcode = '22023', message = 'invalid_agent_address';
  end if;

  if p_human_reference_hash is null
    or p_human_reference_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using errcode = '22023', message = 'invalid_human_reference_hash';
  end if;

  if p_nonce is null or length(p_nonce) not between 8 and 200 then
    raise exception using errcode = '22023', message = 'invalid_world_nonce';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_human_reference_hash, 0));

  select hold.*
  into existing_hold
  from nook.reservation_holds as hold
  where hold.request_id = p_request_id;

  if found then
    if existing_hold.human_backed_authorization_id is not null then
      select auth_row.*
      into existing_authorization
      from nook.human_backed_authorizations as auth_row
      where auth_row.id = existing_hold.human_backed_authorization_id;
    end if;

    if existing_hold.listing_id <> p_listing_id
      or existing_hold.guest_profile_id <> p_guest_profile_id
      or existing_hold.quote_id <> p_quote_id
      or existing_hold.check_in <> p_check_in
      or existing_hold.check_out <> p_check_out
      or existing_authorization.id is null
      or existing_authorization.provider <> p_provider
      or existing_authorization.agent_address <> normalized_agent_address
      or existing_authorization.human_reference_hash <> p_human_reference_hash
    then
      raise exception using errcode = '22023', message = 'idempotency_key_reused';
    end if;

    select auth_row.*
    into existing_nonce_authorization
    from nook.human_backed_authorizations as auth_row
    where auth_row.nonce = p_nonce;

    if found then
      if existing_nonce_authorization.request_id <> p_request_id
        or existing_nonce_authorization.provider <> p_provider
        or existing_nonce_authorization.agent_address <> normalized_agent_address
        or existing_nonce_authorization.human_reference_hash <> p_human_reference_hash
        or existing_nonce_authorization.listing_id <> p_listing_id
        or existing_nonce_authorization.guest_profile_id <> p_guest_profile_id
      then
        raise exception using errcode = '22023', message = 'world_nonce_replayed';
      end if;
    else
      begin
        insert into nook.human_backed_authorizations (
          provider,
          action,
          agent_address,
          human_reference_hash,
          nonce,
          request_id,
          listing_id,
          guest_profile_id,
          outcome,
          created_at
        )
        values (
          p_provider,
          'reservation_hold',
          normalized_agent_address,
          p_human_reference_hash,
          p_nonce,
          p_request_id,
          p_listing_id,
          p_guest_profile_id,
          'verified',
          p_now
        );
      exception
        when unique_violation then
          raise exception using errcode = '22023', message = 'world_nonce_replayed';
      end;
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

  if exists (
    select 1
    from nook.human_backed_authorizations as auth_row
    where auth_row.nonce = p_nonce
  ) then
    raise exception using errcode = '22023', message = 'world_nonce_replayed';
  end if;

  update nook.reservation_holds as hold
  set
    status = 'expired',
    updated_at = p_now
  from nook.human_backed_authorizations as auth_row
  where hold.human_backed_authorization_id = auth_row.id
    and auth_row.human_reference_hash = p_human_reference_hash
    and hold.status = 'active'
    and hold.expires_at <= p_now;

  if exists (
    select 1
    from nook.reservation_holds as hold
    join nook.human_backed_authorizations as auth_row
      on auth_row.id = hold.human_backed_authorization_id
    where auth_row.human_reference_hash = p_human_reference_hash
      and hold.status = 'active'
      and hold.expires_at > p_now
  ) then
    raise exception using errcode = '22023', message = 'human_active_hold_limit';
  end if;

  select binding.*
  into existing_binding
  from nook.agent_bindings as binding
  where binding.network = 'world-chain'
    and binding.agent_address = normalized_agent_address
    and binding.role_scope = 'guest'
  for update;

  if found and existing_binding.profile_id <> p_guest_profile_id then
    raise exception using errcode = '22023', message = 'agent_profile_mismatch';
  end if;

  if found then
    update nook.agent_bindings as binding
    set
      human_backed_verified = true,
      human_verification_ref_hash = p_human_reference_hash,
      human_verification_expires_at = p_expires_at,
      verification_summary = jsonb_build_object(
        'provider', 'world_agentkit',
        'network', 'world-chain'
      ),
      updated_at = p_now
    where binding.id = existing_binding.id;
  else
    insert into nook.agent_bindings (
      profile_id,
      role_scope,
      network,
      agent_address,
      human_backed_verified,
      human_verification_ref_hash,
      human_verification_expires_at,
      verification_summary,
      created_at,
      updated_at
    )
    values (
      p_guest_profile_id,
      'guest',
      'world-chain',
      normalized_agent_address,
      true,
      p_human_reference_hash,
      p_expires_at,
      jsonb_build_object('provider', 'world_agentkit', 'network', 'world-chain'),
      p_now,
      p_now
    );
  end if;

  begin
    insert into nook.human_backed_authorizations (
      provider,
      action,
      agent_address,
      human_reference_hash,
      nonce,
      request_id,
      listing_id,
      guest_profile_id,
      outcome,
      created_at
    )
    values (
      p_provider,
      'reservation_hold',
      normalized_agent_address,
      p_human_reference_hash,
      p_nonce,
      p_request_id,
      p_listing_id,
      p_guest_profile_id,
      'verified',
      p_now
    )
    returning * into created_authorization;
  exception
    when unique_violation then
      raise exception using errcode = '22023', message = 'world_nonce_replayed';
  end;

  select *
  into hold_result
  from nook.create_reservation_hold(
    p_request_id,
    p_listing_id,
    p_guest_profile_id,
    p_quote_id,
    p_check_in,
    p_check_out,
    p_expires_at,
    p_now
  );

  if hold_result.result_kind = 'idempotent' then
    raise exception using errcode = '22023', message = 'idempotency_key_reused';
  end if;

  if hold_result.result_kind = 'conflict' then
    update nook.human_backed_authorizations as auth_row
    set outcome = 'dates_unavailable'
    where auth_row.id = created_authorization.id;
  else
    update nook.reservation_holds as hold
    set human_backed_authorization_id = created_authorization.id
    where hold.id = hold_result.id;

    update nook.human_backed_authorizations as auth_row
    set
      hold_id = hold_result.id,
      outcome = 'hold_created'
    where auth_row.id = created_authorization.id;
  end if;

  return query
  select
    hold_result.result_kind::text,
    hold_result.id::uuid,
    hold_result.request_id::text,
    hold_result.listing_id::uuid,
    hold_result.guest_profile_id::uuid,
    hold_result.quote_id::uuid,
    hold_result.check_in::date,
    hold_result.check_out::date,
    hold_result.status::text,
    hold_result.expires_at::timestamptz,
    hold_result.created_at::timestamptz,
    hold_result.updated_at::timestamptz;
end;
$$;

revoke all on function nook.create_human_backed_reservation_hold(
  text,
  uuid,
  uuid,
  uuid,
  date,
  date,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text
) from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function nook.create_human_backed_reservation_hold(text, uuid, uuid, uuid, date, date, timestamptz, timestamptz, text, text, text, text) to service_role';
  end if;
end;
$$;
