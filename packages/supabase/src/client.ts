import postgres from 'postgres';

export type PostgresClient = ReturnType<typeof postgres>;

export function createPostgresClient(
  connectionString: string,
  options: { maxConnections?: number } = {},
): PostgresClient {
  if (connectionString.trim().length === 0) {
    throw new Error('Supabase database connection string is required');
  }

  return postgres(connectionString, {
    idle_timeout: 20,
    max: options.maxConnections ?? 5,
    prepare: false,
  });
}
