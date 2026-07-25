import {
  type AgentRegistrationSignal,
  type OnchainSignalPort,
  OnchainSignalProviderError,
} from '@nook-rent/core';
import { z } from 'zod';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const endpointSchema = z.object({
  name: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
});

const registrationFileSchema = z
  .object({
    active: z.boolean().nullish(),
    endpointsRawJson: z.string().nullish(),
    mcpTools: z.array(z.string()).nullish(),
    a2aSkills: z.array(z.string()).nullish(),
    oasfSkills: z.array(z.string()).nullish(),
  })
  .nullish();

const agentSchema = z.object({
  id: z.string().min(1),
  owner: z.string().regex(EVM_ADDRESS),
  operators: z.array(z.string().regex(EVM_ADDRESS)).default([]),
  agentWallet: z.string().regex(EVM_ADDRESS).nullish(),
  registrationFile: registrationFileSchema,
});

const graphResponseSchema = z.object({
  data: z.object({
    walletAgents: z.array(agentSchema),
    ownedAgents: z.array(agentSchema),
    operatorAgents: z.array(agentSchema),
  }),
  errors: z.array(z.object({ message: z.string().optional() }).passthrough()).optional(),
});

type AgentRecord = z.infer<typeof agentSchema>;
type AgentBinding = AgentRegistrationSignal['binding'];

interface Candidate {
  record: AgentRecord;
  binding: AgentBinding;
}

interface CacheEntry {
  expiresAt: number;
  signal: AgentRegistrationSignal | null;
}

export interface Agent0GraphClientOptions {
  apiKey: string;
  subgraphId: string;
  chainId: number;
  network: string;
  requiredCapability: string;
  gatewayUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

const AGENT_BY_SIGNING_WALLET_QUERY = `
  query AgentBySigningWallet($address: Bytes!, $addresses: [Bytes!]!) {
    walletAgents: agents(
      where: { agentWallet: $address, registrationFile_not: null }
      first: 10
      orderBy: updatedAt
      orderDirection: desc
    ) {
      ...AgentRegistration
    }
    ownedAgents: agents(
      where: { owner: $address, registrationFile_not: null }
      first: 10
      orderBy: updatedAt
      orderDirection: desc
    ) {
      ...AgentRegistration
    }
    operatorAgents: agents(
      where: { operators_contains: $addresses, registrationFile_not: null }
      first: 10
      orderBy: updatedAt
      orderDirection: desc
    ) {
      ...AgentRegistration
    }
  }

  fragment AgentRegistration on Agent {
    id
    owner
    operators
    agentWallet
    registrationFile {
      active
      endpointsRawJson
      mcpTools
      a2aSkills
      oasfSkills
    }
  }
`;

function normalizeAddress(address: string): string {
  if (!EVM_ADDRESS.test(address)) {
    throw new OnchainSignalProviderError(
      'invalid_provider_response',
      'Agent address is not a valid EVM address',
    );
  }

  return address.toLowerCase();
}

function normalizeCapability(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : undefined;
}

function endpointPrefix(name: string): string | undefined {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : undefined;
}

function registrationCapabilities(record: AgentRecord): string[] {
  const registration = record.registrationFile;
  if (!registration) {
    return [];
  }

  const capabilities = new Set<string>();
  const add = (prefix: string, value: string) => {
    const normalized = normalizeCapability(value);
    if (normalized) capabilities.add(`${prefix}:${normalized}`);
  };

  for (const tool of registration.mcpTools ?? []) add('mcp', tool);
  for (const skill of registration.a2aSkills ?? []) add('a2a', skill);
  for (const skill of registration.oasfSkills ?? []) add('oasf', skill);

  if (registration.endpointsRawJson) {
    try {
      const endpoints = z.array(endpointSchema).parse(JSON.parse(registration.endpointsRawJson));
      for (const endpoint of endpoints) {
        const prefix = endpoint.name ? endpointPrefix(endpoint.name) : undefined;
        if (!prefix) continue;
        for (const capability of endpoint.capabilities ?? []) add(prefix, capability);
        for (const skill of endpoint.skills ?? []) add(prefix, skill);
      }
    } catch {
      // A malformed optional registration file cannot grant a capability.
    }
  }

  return [...capabilities].sort();
}

function candidateScore(candidate: Candidate, requiredCapability: string): number {
  const registration = candidate.record.registrationFile;
  const active = registration?.active === true;
  const capable = registrationCapabilities(candidate.record).includes(requiredCapability);
  const bindingRank =
    candidate.binding === 'agent_wallet' ? 3 : candidate.binding === 'owner' ? 2 : 1;

  return (active ? 100 : 0) + (capable ? 10 : 0) + bindingRank;
}

function candidatesFromResponse(response: z.infer<typeof graphResponseSchema>): Candidate[] {
  const candidates: Candidate[] = [];
  const seen = new Set<string>();

  const add = (records: AgentRecord[], binding: AgentBinding) => {
    for (const record of records) {
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      candidates.push({ record, binding });
    }
  };

  add(response.data.walletAgents, 'agent_wallet');
  add(response.data.ownedAgents, 'owner');
  add(response.data.operatorAgents, 'operator');

  return candidates;
}

export class Agent0GraphClient implements OnchainSignalPort {
  private readonly fetchImplementation: typeof fetch;
  private readonly now: () => number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly endpoint: string;
  private readonly sourceRef: string;

  constructor(private readonly options: Agent0GraphClientOptions) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.now = options.now ?? Date.now;
    this.endpoint = `${(options.gatewayUrl ?? 'https://gateway.thegraph.com/api').replace(
      /\/$/,
      '',
    )}/${encodeURIComponent(options.apiKey)}/subgraphs/id/${encodeURIComponent(
      options.subgraphId,
    )}`;
    this.sourceRef = `the-graph:agent0:${options.network}:${options.subgraphId}`;
  }

  async getAgentRegistration(agentAddress: string): Promise<AgentRegistrationSignal | undefined> {
    const normalizedAddress = normalizeAddress(agentAddress);
    const cached = this.cache.get(normalizedAddress);
    const now = this.now();

    if (cached && cached.expiresAt > now) {
      return cached.signal ?? undefined;
    }

    const signal = await this.queryAgentRegistration(normalizedAddress);
    const cacheTtlMs = this.options.cacheTtlMs ?? 15_000;
    this.cache.set(normalizedAddress, {
      expiresAt: now + cacheTtlMs,
      signal: signal ?? null,
    });

    return signal;
  }

  private async queryAgentRegistration(
    normalizedAddress: string,
  ): Promise<AgentRegistrationSignal | undefined> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 3_500);

    try {
      const response = await this.fetchImplementation(this.endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          query: AGENT_BY_SIGNING_WALLET_QUERY,
          variables: {
            address: normalizedAddress,
            addresses: [normalizedAddress],
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new OnchainSignalProviderError(
          'provider_unavailable',
          `The Graph gateway returned HTTP ${response.status}`,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new OnchainSignalProviderError(
          'invalid_provider_response',
          'The Graph gateway returned invalid JSON',
        );
      }

      const parsed = graphResponseSchema.safeParse(payload);
      if (!parsed.success || parsed.data.errors?.length) {
        throw new OnchainSignalProviderError(
          'invalid_provider_response',
          'The Graph gateway response did not match the Agent0 schema',
        );
      }

      const candidates = candidatesFromResponse(parsed.data).sort(
        (left, right) =>
          candidateScore(right, this.options.requiredCapability) -
          candidateScore(left, this.options.requiredCapability),
      );
      const selected = candidates[0];

      if (!selected) {
        return undefined;
      }

      return {
        active: selected.record.registrationFile?.active === true,
        agentAddress: normalizedAddress,
        operatorAddresses: selected.record.operators.map((address) => normalizeAddress(address)),
        capabilities: registrationCapabilities(selected.record),
        sourceRef: this.sourceRef,
        chainId: this.options.chainId,
        subgraphId: this.options.subgraphId,
        network: this.options.network,
        binding: selected.binding,
      };
    } catch (error) {
      if (error instanceof OnchainSignalProviderError) {
        throw error;
      }

      if (controller.signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw new OnchainSignalProviderError(
          'provider_timeout',
          'The Graph gateway query timed out',
        );
      }

      throw new OnchainSignalProviderError(
        'provider_unavailable',
        'The Graph gateway query failed',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
