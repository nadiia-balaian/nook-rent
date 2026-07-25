insert into nook.profiles (id, role, public_ref)
values (
  '10000000-0000-4000-8000-000000000002',
  'host',
  'lisbon-demo-host'
)
on conflict (id) do update
set
  role = excluded.role,
  public_ref = excluded.public_ref;

insert into nook.profiles (id, role, public_ref)
values (
  '10000000-0000-4000-8000-000000000001',
  'both',
  'maria-member'
)
on conflict (id) do update
set
  role = excluded.role,
  public_ref = excluded.public_ref;

update nook.listings
set
  host_profile_id = '10000000-0000-4000-8000-000000000002',
  updated_at = now()
where id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002'
);
