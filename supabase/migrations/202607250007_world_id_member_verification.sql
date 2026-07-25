alter table nook.world_id_verifications
  drop constraint if exists world_id_verifications_role_check;

update nook.world_id_verifications
set role = 'member'
where role = 'host';

alter table nook.world_id_verifications
  add constraint world_id_verifications_role_check
  check (role = 'member');
