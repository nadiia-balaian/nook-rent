import { z } from 'zod';

const aiEnvironmentSchema = z.object({
  OPENAI_API_KEY: z.string().trim().min(1),
  OPENAI_MODEL: z.string().trim().min(1).default('gpt-5.6-sol'),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(8_000),
});

export interface AiEnvironment {
  apiKey: string;
  model: string;
  timeoutMilliseconds: number;
}

export function parseOptionalAiEnvironment(
  environment: Record<string, string | undefined>,
): AiEnvironment | undefined {
  if (!environment.OPENAI_API_KEY?.trim()) {
    return undefined;
  }

  const parsed = aiEnvironmentSchema.parse(environment);

  return {
    apiKey: parsed.OPENAI_API_KEY,
    model: parsed.OPENAI_MODEL,
    timeoutMilliseconds: parsed.OPENAI_TIMEOUT_MS,
  };
}
