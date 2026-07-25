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
