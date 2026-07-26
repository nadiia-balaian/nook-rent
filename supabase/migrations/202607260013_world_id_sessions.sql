alter table nook.world_id_verifications
  alter column nullifier drop not null;

alter table nook.world_id_verifications
  add column world_session_id text
    check (world_session_id ~ '^session_[0-9a-fA-F]{128}$');

alter table nook.world_id_verifications
  add constraint world_id_verifications_identity_check
  check (
    (world_session_id is null and nullifier is not null)
    or (world_session_id is not null and nullifier is null)
  );

alter table nook.world_id_verifications
  add constraint world_id_verifications_world_session_key
  unique (world_session_id);

create table nook.world_id_session_proofs (
  session_nullifier numeric(78, 0) primary key
    check (session_nullifier >= 0),
  world_session_id text not null
    references nook.world_id_verifications(world_session_id),
  member_session_id uuid unique
    references nook.member_sessions(id),
  verified_at timestamptz not null default now()
);

revoke all on table nook.world_id_session_proofs from public;
alter table nook.world_id_session_proofs enable row level security;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert on table nook.world_id_session_proofs to service_role';
  end if;
end;
$$;
