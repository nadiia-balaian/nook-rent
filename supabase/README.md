# Supabase

Nook.rent database changes belong in `supabase/migrations`.

Rules:

- every hosted schema change is a versioned migration;
- migrations are forward-only after being applied to a shared environment;
- tables and policies use Nook.rent domain language;
- browser access is denied until an explicit row-level policy is reviewed;
- service-role and database credentials remain in local or hosted environment
  configuration;
- atomic Reservation Hold creation must prevent overlapping dates;
- hosted migration execution requires explicit authorization.

## Current implementation

The migrations create an isolated `nook` schema containing the marketplace
tables, Listing pricing terms, idempotency constraints, default-deny row-level
security, atomic hold function, bounded expiry function, and durable Hedera
deposit Operations. The Phase 6 migration adds atomic human-backed
authorization, nonce replay defense, and a one-active-hold limit. All migrations
pass the repository and marketplace API integration suites against local
PostgreSQL.

Migrations through `202607260011_expire_pending_booking_with_hold.sql` are
applied to hosted Supabase. The Member Session and Agent Payment Mandate
migrations are locally implemented and remain explicit hosted writes.

To apply the migration to an explicitly selected database:

```text
SUPABASE_DB_URL=... pnpm supabase:migrate
```

This command is intentionally not part of the normal development or CI flow.
