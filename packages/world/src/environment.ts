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

const worldIdEnvironmentSchema = z.object({
  WORLD_ID_APP_ID: z.string().startsWith('app_'),
  WORLD_ID_RP_ID: z.string().startsWith('rp_'),
  WORLD_ID_SIGNING_KEY: privateKey,
  WORLD_ID_ACTION: z.string().trim().min(3).max(120).default('nook-member-onboarding'),
  WORLD_ID_ENVIRONMENT: z.enum(['production', 'staging', 'sandbox']).default('production'),
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

export interface WorldIdEnvironment {
  appId: `app_${string}`;
  rpId: `rp_${string}`;
  signingKey: `0x${string}`;
  action: string;
  environment: 'production' | 'staging' | 'sandbox';
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

export function parseOptionalWorldGuestAgentEnvironment(
  environment: Record<string, string | undefined>,
): WorldGuestAgentEnvironment | undefined {
  if (!environment.WORLD_AGENT_WALLET_PRIVATE_KEY) {
    return undefined;
  }

  return parseWorldGuestAgentEnvironment(environment);
}

export function parseOptionalWorldIdEnvironment(
  environment: Record<string, string | undefined>,
): WorldIdEnvironment | undefined {
  const hasWorldIdConfiguration = [
    environment.WORLD_ID_APP_ID,
    environment.WORLD_ID_RP_ID,
    environment.WORLD_ID_SIGNING_KEY,
  ].some(Boolean);

  if (!hasWorldIdConfiguration) {
    return undefined;
  }

  const parsed = worldIdEnvironmentSchema.parse(environment);
  return {
    appId: parsed.WORLD_ID_APP_ID as `app_${string}`,
    rpId: parsed.WORLD_ID_RP_ID as `rp_${string}`,
    signingKey: parsed.WORLD_ID_SIGNING_KEY as `0x${string}`,
    action: parsed.WORLD_ID_ACTION,
    environment: parsed.WORLD_ID_ENVIRONMENT,
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
