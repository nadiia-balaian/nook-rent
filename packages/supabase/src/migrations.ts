import { readdir, readFile } from 'node:fs/promises';

import type { PostgresClient } from './client.js';

const DEFAULT_MIGRATIONS_URL = new URL('../../../supabase/migrations/', import.meta.url);
const MIGRATION_FILE_PATTERN = /^\d+_[a-z0-9_]+\.sql$/;

export async function applyMigrations(
  sql: PostgresClient,
  migrationsUrl: URL = DEFAULT_MIGRATIONS_URL,
): Promise<string[]> {
  await sql`create schema if not exists nook`;
  await sql`
    create table if not exists nook.schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    )
  `;
  await sql`alter table nook.schema_migrations enable row level security`;

  const filenames = (await readdir(migrationsUrl))
    .filter((filename) => MIGRATION_FILE_PATTERN.test(filename))
    .sort();
  const appliedNow: string[] = [];

  for (const filename of filenames) {
    const [existing] = await sql<{ filename: string }[]>`
      select filename
      from nook.schema_migrations
      where filename = ${filename}
    `;

    if (existing) {
      continue;
    }

    const migrationSql = await readFile(new URL(filename, migrationsUrl), 'utf8');

    await sql.begin(async (transaction) => {
      await transaction.unsafe(migrationSql);
      await transaction`
        insert into nook.schema_migrations (filename)
        values (${filename})
      `;
    });

    appliedNow.push(filename);
  }

  return appliedNow;
}
