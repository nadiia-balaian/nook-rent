import { z } from 'zod';

const nodeEnvironmentSchema = z.enum(['development', 'test', 'production']).default('development');

const portSchema = z.coerce.number().int().min(1).max(65_535);

const serverEnvironmentSchema = z.object({
  NODE_ENV: nodeEnvironmentSchema,
  API_HOST: z.string().min(1).default('0.0.0.0'),
  API_PORT: portSchema.default(3100),
  ALLOWED_ORIGINS: z.string().optional(),
});

const databaseEnvironmentSchema = z.object({
  SUPABASE_DB_URL: z.string().min(1),
});

export interface ServerEnvironment {
  nodeEnvironment: 'development' | 'test' | 'production';
  apiHost: string;
  apiPort: number;
  allowedOrigins: string[];
}

export interface DatabaseEnvironment {
  connectionString: string;
}

export function parseServerEnvironment(
  environment: Record<string, string | undefined>,
): ServerEnvironment {
  const parsed = serverEnvironmentSchema.parse(environment);

  return {
    nodeEnvironment: parsed.NODE_ENV,
    apiHost: parsed.API_HOST,
    apiPort: parsed.API_PORT,
    allowedOrigins:
      parsed.ALLOWED_ORIGINS?.split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0) ?? [],
  };
}

export function parseDatabaseEnvironment(
  environment: Record<string, string | undefined>,
): DatabaseEnvironment {
  const parsed = databaseEnvironmentSchema.parse(environment);

  return {
    connectionString: parsed.SUPABASE_DB_URL,
  };
}
