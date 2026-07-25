import { z } from 'zod';

export const BASE_SEPOLIA_AGENT0_SUBGRAPH_ID = '4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u';
export const ETHEREUM_MAINNET_ENS_SUBGRAPH_ID = '5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH';
export const BASE_SEPOLIA_AGENT0_IDENTITY_REGISTRY = '0x8004A818BFB912233c491871b3d84c89A494BD9e';
export const DEFAULT_AGENT_CAPABILITY = 'nook.rent:reservation-hold';
export const AGENT0_REGISTRATION_CONFIRMATION = 'register-nook-agent-base-sepolia';

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.url().optional(),
);

const graphEnvironmentSchema = z.object({
  THE_GRAPH_API_KEY: z.string().trim().min(1),
  THE_GRAPH_AGENT0_SUBGRAPH_ID: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{20,80}$/),
  THE_GRAPH_ENS_SUBGRAPH_ID: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{20,80}$/)
    .default(ETHEREUM_MAINNET_ENS_SUBGRAPH_ID),
  THE_GRAPH_AGENT0_CHAIN_ID: z.coerce.number().int().positive().default(84_532),
  THE_GRAPH_REQUIRED_CAPABILITY: z.string().trim().min(3).default(DEFAULT_AGENT_CAPABILITY),
  THE_GRAPH_GATEWAY_URL: optionalUrl,
  THE_GRAPH_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(3_500),
  THE_GRAPH_CACHE_TTL_MS: z.coerce.number().int().min(0).max(300_000).default(15_000),
});

const agent0RegistrationEnvironmentSchema = z.object({
  THE_GRAPH_AGENT0_CHAIN_ID: z.coerce
    .number()
    .int()
    .positive()
    .refine((value) => value === 84_532, 'Agent registration is restricted to Base Sepolia'),
  THE_GRAPH_AGENT0_RPC_URL: z.url(),
  THE_GRAPH_AGENT0_REGISTRY_ADDRESS: z
    .string()
    .regex(/^0x[0-9a-fA-F]{40}$/)
    .default(BASE_SEPOLIA_AGENT0_IDENTITY_REGISTRY),
  THE_GRAPH_AGENT0_REGISTER_CONFIRM: z.literal(AGENT0_REGISTRATION_CONFIRMATION),
  WORLD_AGENT_WALLET_PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export interface GraphEnvironment {
  apiKey: string;
  subgraphId: string;
  ensSubgraphId: string;
  chainId: number;
  network: string;
  requiredCapability: string;
  gatewayUrl: string;
  timeoutMs: number;
  cacheTtlMs: number;
}

export interface Agent0RegistrationEnvironment {
  chainId: 84_532;
  rpcUrl: string;
  registryAddress: `0x${string}`;
  privateKey: `0x${string}`;
}

export function graphNetworkName(chainId: number): string {
  switch (chainId) {
    case 84_532:
      return 'base-sepolia';
    case 11155111:
      return 'ethereum-sepolia';
    case 8453:
      return 'base';
    case 1:
      return 'ethereum';
    default:
      return `eip155:${chainId}`;
  }
}

export function parseOptionalGraphEnvironment(
  environment: Record<string, string | undefined>,
): GraphEnvironment | undefined {
  const hasGraphConfiguration = [
    environment.THE_GRAPH_API_KEY,
    environment.THE_GRAPH_AGENT0_SUBGRAPH_ID,
  ].some((value) => Boolean(value?.trim()));

  if (!hasGraphConfiguration) {
    return undefined;
  }

  const parsed = graphEnvironmentSchema.parse(environment);
  return {
    apiKey: parsed.THE_GRAPH_API_KEY,
    subgraphId: parsed.THE_GRAPH_AGENT0_SUBGRAPH_ID,
    ensSubgraphId: parsed.THE_GRAPH_ENS_SUBGRAPH_ID,
    chainId: parsed.THE_GRAPH_AGENT0_CHAIN_ID,
    network: graphNetworkName(parsed.THE_GRAPH_AGENT0_CHAIN_ID),
    requiredCapability: parsed.THE_GRAPH_REQUIRED_CAPABILITY.toLowerCase(),
    gatewayUrl: parsed.THE_GRAPH_GATEWAY_URL ?? 'https://gateway.thegraph.com/api',
    timeoutMs: parsed.THE_GRAPH_TIMEOUT_MS,
    cacheTtlMs: parsed.THE_GRAPH_CACHE_TTL_MS,
  };
}

export function parseAgent0RegistrationEnvironment(
  environment: Record<string, string | undefined>,
): Agent0RegistrationEnvironment {
  const parsed = agent0RegistrationEnvironmentSchema.parse(environment);

  return {
    chainId: 84_532,
    rpcUrl: parsed.THE_GRAPH_AGENT0_RPC_URL,
    registryAddress: parsed.THE_GRAPH_AGENT0_REGISTRY_ADDRESS as `0x${string}`,
    privateKey: parsed.WORLD_AGENT_WALLET_PRIVATE_KEY as `0x${string}`,
  };
}
