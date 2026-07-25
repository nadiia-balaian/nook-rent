import { z } from 'zod';

const optionalEnvironmentValue = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
);
const optionalEnvironmentUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.url().optional(),
);

const poapEnvironmentSchema = z.object({
  POAP_SOURCE: z.literal('compass'),
  POAP_GRAPHQL_URL: optionalEnvironmentUrl,
  POAP_GRAPHQL_API_KEY: optionalEnvironmentValue,
  WALLET_CHALLENGE_SECRET: z.string().min(32),
  WALLET_CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(60).max(900).default(300),
});

export interface PoapEnvironment {
  source: 'compass';
  endpoint?: string;
  apiKey?: string;
  challengeSecret: string;
  challengeTtlSeconds: number;
}

export function parseOptionalPoapEnvironment(
  environment: Record<string, string | undefined>,
): PoapEnvironment | undefined {
  if (!environment.POAP_SOURCE || environment.POAP_SOURCE === 'disabled') {
    return undefined;
  }

  const parsed = poapEnvironmentSchema.parse(environment);
  return {
    source: parsed.POAP_SOURCE,
    ...(parsed.POAP_GRAPHQL_URL ? { endpoint: parsed.POAP_GRAPHQL_URL } : {}),
    ...(parsed.POAP_GRAPHQL_API_KEY ? { apiKey: parsed.POAP_GRAPHQL_API_KEY } : {}),
    challengeSecret: parsed.WALLET_CHALLENGE_SECRET,
    challengeTtlSeconds: parsed.WALLET_CHALLENGE_TTL_SECONDS,
  };
}
