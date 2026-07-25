update nook.agent_bindings
set
  profile_id = '10000000-0000-4000-8000-000000000001',
  updated_at = now()
where profile_id = '20000000-0000-4000-8000-000000000001'
  and role_scope = 'guest'
  and network = 'world-chain'
  and agent_address = '0xfbeb3862992eec606c27739d0d8f679e0a288647';
