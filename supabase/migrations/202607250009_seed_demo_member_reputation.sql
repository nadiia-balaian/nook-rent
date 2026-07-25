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
