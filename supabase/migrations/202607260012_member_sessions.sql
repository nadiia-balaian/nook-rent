create table nook.member_sessions (
  id uuid primary key,
  token_hash text not null unique
    check (token_hash ~ '^[a-f0-9]{64}$'),
  profile_id uuid references nook.profiles(id),
  world_verified_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (
    (profile_id is null and world_verified_at is null)
    or (profile_id is not null and world_verified_at is not null)
  )
);

create index member_sessions_active_token_idx
  on nook.member_sessions (token_hash, expires_at);

revoke all on table nook.member_sessions from public;
alter table nook.member_sessions enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on table nook.member_sessions to service_role';
  end if;
end;
$$;
