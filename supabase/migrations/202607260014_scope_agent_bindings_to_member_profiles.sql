alter table nook.agent_bindings
  drop constraint agent_bindings_network_agent_address_role_scope_key;

alter table nook.agent_bindings
  add constraint agent_bindings_profile_agent_role_key
  unique (profile_id, network, agent_address, role_scope);

do $$
declare
  function_signature regprocedure :=
    'nook.create_human_backed_reservation_hold(text,uuid,uuid,uuid,date,date,timestamp with time zone,timestamp with time zone,text,text,text,text)'::regprocedure;
  function_definition text;
begin
  select pg_get_functiondef(function_signature)
  into function_definition;

  function_definition := replace(
    function_definition,
    'perform pg_advisory_xact_lock(hashtextextended(p_human_reference_hash, 0));',
    'perform pg_advisory_xact_lock(hashtextextended(p_guest_profile_id::text, 0));'
  );

  function_definition := replace(
    function_definition,
    'where auth_row.human_reference_hash = p_human_reference_hash
      and hold.status = ''active''
      and hold.expires_at > p_now',
    'where hold.guest_profile_id = p_guest_profile_id
      and hold.status = ''active''
      and hold.expires_at > p_now'
  );

  function_definition := replace(
    function_definition,
    'where binding.network = ''world-chain''
    and binding.agent_address = normalized_agent_address
    and binding.role_scope = ''guest''
  for update;

  if found and existing_binding.profile_id <> p_guest_profile_id then
    raise exception using errcode = ''22023'', message = ''agent_profile_mismatch'';
  end if;',
    'where binding.profile_id = p_guest_profile_id
    and binding.network = ''world-chain''
    and binding.agent_address = normalized_agent_address
    and binding.role_scope = ''guest''
  for update;'
  );

  if function_definition like '%agent_profile_mismatch%' then
    raise exception 'Could not update the Reservation Hold Agent binding scope';
  end if;

  execute function_definition;
end;
$$;
