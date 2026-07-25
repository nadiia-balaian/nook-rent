import { createPostgresClient } from './client.js';

const connectionString = process.env.SUPABASE_DB_URL;
const settlementTokenId = process.env.HEDERA_TOKEN_ID?.trim() || '0.0.12345';

if (!connectionString) {
  throw new Error('SUPABASE_DB_URL is required to seed demo data');
}

const sql = createPostgresClient(connectionString, { maxConnections: 1 });

try {
  await sql.begin(async (transaction) => {
    await transaction`
      insert into nook.profiles (id, role, public_ref)
      values
        ('10000000-0000-4000-8000-000000000001', 'both', 'maria-member'),
        ('10000000-0000-4000-8000-000000000002', 'host', 'lisbon-demo-host'),
        ('20000000-0000-4000-8000-000000000002', 'guest', 'newcomer-guest')
      on conflict (id) do update
      set
        role = excluded.role,
        public_ref = excluded.public_ref
    `;
    await transaction`
      insert into nook.listings (
        id,
        host_profile_id,
        title,
        description,
        city,
        neighborhood,
        approximate_location_ref,
        amenities,
        house_rules,
        settlement_token_id,
        nightly_rate_atomic,
        base_deposit_atomic,
        max_guests,
        status
      )
      values
        (
          '30000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000002',
          'Alfama work-friendly nook',
          'A bright temporary stay with reliable Wi-Fi and a dedicated desk.',
          'Lisbon',
          'Alfama',
          'lisbon-alfama-demo-area',
          array['wifi', 'desk', 'washer'],
          array['No smoking', 'Quiet after 22:00'],
          ${settlementTokenId},
          10000,
          50000,
          2,
          'published'
        ),
        (
          '30000000-0000-4000-8000-000000000002',
          '10000000-0000-4000-8000-000000000002',
          'Estrela garden studio',
          'A calm studio near the garden for a short work or event stay.',
          'Lisbon',
          'Estrela',
          'lisbon-estrela-demo-area',
          array['wifi', 'kitchen', 'air conditioning'],
          array['No parties', 'No smoking'],
          ${settlementTokenId},
          12500,
          60000,
          2,
          'published'
        )
      on conflict (id) do update
      set
        host_profile_id = excluded.host_profile_id,
        title = excluded.title,
        description = excluded.description,
        city = excluded.city,
        neighborhood = excluded.neighborhood,
        approximate_location_ref = excluded.approximate_location_ref,
        amenities = excluded.amenities,
        house_rules = excluded.house_rules,
        settlement_token_id = excluded.settlement_token_id,
        nightly_rate_atomic = excluded.nightly_rate_atomic,
        base_deposit_atomic = excluded.base_deposit_atomic,
        max_guests = excluded.max_guests,
        status = excluded.status,
        updated_at = now()
    `;
    await transaction`
      insert into nook.availability_windows (id, listing_id, check_in, check_out)
      values
        (
          '31000000-0000-4000-8000-000000000001',
          '30000000-0000-4000-8000-000000000001',
          '2026-08-01',
          '2026-10-30'
        ),
        (
          '31000000-0000-4000-8000-000000000002',
          '30000000-0000-4000-8000-000000000002',
          '2026-08-15',
          '2026-11-13'
        )
      on conflict (id) do update
      set
        check_in = excluded.check_in,
        check_out = excluded.check_out
    `;
    await transaction`
      insert into nook.listing_approval_policies (
        listing_id,
        automatic_approval_enabled,
        minimum_rental_reputation_tier,
        version
      )
      values
        ('30000000-0000-4000-8000-000000000001', true, 'silver', 1),
        ('30000000-0000-4000-8000-000000000002', true, 'silver', 1)
      on conflict (listing_id) do update
      set
        automatic_approval_enabled = excluded.automatic_approval_enabled,
        minimum_rental_reputation_tier = excluded.minimum_rental_reputation_tier,
        version = excluded.version,
        updated_at = now()
    `;
    await transaction`
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
        rebuilt_at = now()
    `;
  });

  console.log('Seeded three demo profiles and two Lisbon Listings.');
} finally {
  await sql.end();
}
