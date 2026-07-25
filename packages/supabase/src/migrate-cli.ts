import { createPostgresClient } from './client.js';
import { applyMigrations } from './migrations.js';

const connectionString = process.env.SUPABASE_DB_URL;

if (!connectionString) {
  throw new Error('SUPABASE_DB_URL is required to apply hosted migrations');
}

const sql = createPostgresClient(connectionString, { maxConnections: 1 });

try {
  const applied = await applyMigrations(sql);

  if (applied.length === 0) {
    console.log('Database schema is already current.');
  } else {
    console.log(`Applied ${applied.length} migration(s): ${applied.join(', ')}`);
  }
} finally {
  await sql.end();
}
