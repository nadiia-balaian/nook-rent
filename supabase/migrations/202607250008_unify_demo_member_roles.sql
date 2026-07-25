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

update nook.profiles
set
  role = 'both',
  public_ref = 'maria-member'
where id = '10000000-0000-4000-8000-000000000001';

update nook.listings
set
  host_profile_id = '10000000-0000-4000-8000-000000000002',
  updated_at = now()
where id in (
  '30000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002'
);

insert into nook.reputation_projections (
  profile_id,
  ruleset_version,
  total_units,
  tier,
  completed_stays,
  event_count
)
values (
  '10000000-0000-4000-8000-000000000001',
  1,
  3,
  'silver',
  3,
  3
)
on conflict (profile_id) do update
set
  ruleset_version = excluded.ruleset_version,
  total_units = excluded.total_units,
  tier = excluded.tier,
  completed_stays = excluded.completed_stays,
  event_count = excluded.event_count,
  rebuilt_at = now();
