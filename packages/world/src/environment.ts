import { z } from 'zod';

const privateKey = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/, 'must be a 32-byte 0x-prefixed private key');

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.url().optional(),
);

const verifierEnvironmentSchema = z.object({
  WORLD_AGENTKIT_RESOURCE_URI: z.url(),
  WORLD_HUMAN_REFERENCE_SECRET: z.string().min(32),
  WORLD_CHAIN_RPC_URL: optionalUrl,
});

const guestAgentEnvironmentSchema = verifierEnvironmentSchema.extend({
  WORLD_AGENT_WALLET_PRIVATE_KEY: privateKey,
});

const agentWalletEnvironmentSchema = z.object({
  WORLD_AGENT_WALLET_PRIVATE_KEY: privateKey,
});

export interface WorldVerifierEnvironment {
  resourceUri: string;
  humanReferenceSecret: string;
  rpcUrl?: string;
}

export interface WorldGuestAgentEnvironment extends WorldVerifierEnvironment {
  agentWalletPrivateKey: `0x${string}`;
}

export interface WorldAgentWalletEnvironment {
  agentWalletPrivateKey: `0x${string}`;
}

export function parseOptionalWorldVerifierEnvironment(
  environment: Record<string, string | undefined>,
): WorldVerifierEnvironment | undefined {
  const hasWorldConfiguration = [
    environment.WORLD_AGENTKIT_RESOURCE_URI,
    environment.WORLD_HUMAN_REFERENCE_SECRET,
    environment.WORLD_CHAIN_RPC_URL,
  ].some(Boolean);

  if (!hasWorldConfiguration) {
    return undefined;
  }

  const parsed = verifierEnvironmentSchema.parse(environment);
  return {
    resourceUri: parsed.WORLD_AGENTKIT_RESOURCE_URI,
    humanReferenceSecret: parsed.WORLD_HUMAN_REFERENCE_SECRET,
    ...(parsed.WORLD_CHAIN_RPC_URL ? { rpcUrl: parsed.WORLD_CHAIN_RPC_URL } : {}),
  };
}

export function parseWorldGuestAgentEnvironment(
  environment: Record<string, string | undefined>,
): WorldGuestAgentEnvironment {
  const parsed = guestAgentEnvironmentSchema.parse(environment);
  return {
    resourceUri: parsed.WORLD_AGENTKIT_RESOURCE_URI,
    humanReferenceSecret: parsed.WORLD_HUMAN_REFERENCE_SECRET,
    agentWalletPrivateKey: parsed.WORLD_AGENT_WALLET_PRIVATE_KEY as `0x${string}`,
    ...(parsed.WORLD_CHAIN_RPC_URL ? { rpcUrl: parsed.WORLD_CHAIN_RPC_URL } : {}),
  };
}

export function parseWorldAgentWalletEnvironment(
  environment: Record<string, string | undefined>,
): WorldAgentWalletEnvironment {
  const parsed = agentWalletEnvironmentSchema.parse(environment);
  return {
    agentWalletPrivateKey: parsed.WORLD_AGENT_WALLET_PRIVATE_KEY as `0x${string}`,
  };
}
