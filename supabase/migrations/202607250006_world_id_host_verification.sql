create table nook.world_id_verifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references nook.profiles(id),
  role text not null check (role = 'host'),
  provider text not null check (provider = 'world_id'),
  credential text not null check (credential = 'proof_of_human'),
  action text not null check (length(action) between 3 and 120),
  environment text not null check (environment in ('production', 'staging', 'sandbox')),
  protocol_version text not null check (protocol_version in ('3.0', '4.0')),
  nullifier numeric(78, 0) not null check (nullifier >= 0),
  verified_at timestamptz not null default now(),
  unique (nullifier, action),
  unique (profile_id, role, action)
);

revoke all on table nook.world_id_verifications from public;
alter table nook.world_id_verifications enable row level security;
