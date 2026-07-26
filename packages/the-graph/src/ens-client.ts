import {
  type EnsNameReaderPort,
  type EnsNameSignal,
  OnchainSignalProviderError,
} from '@nook-rent/core';
import { z } from 'zod';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UNNORMALIZED_LABEL = /(^|\.)\[[0-9a-f]{64}\](?=\.|$)/i;

const domainSchema = z.object({
  name: z.string().nullish(),
});

const graphResponseSchema = z.object({
  data: z.object({
    domains: z.array(domainSchema),
    wrappedDomains: z.array(domainSchema).default([]),
  }),
  errors: z.array(z.object({ message: z.string().optional() }).passthrough()).optional(),
});

const OWNED_ENS_NAMES_QUERY = `
  query WalletEnsNames($owner: String!, $first: Int!) {
    domains(
      first: $first
      where: { owner: $owner }
      orderBy: createdAt
      orderDirection: desc
    ) {
      name
    }
    wrappedDomains(first: $first, where: { owner: $owner }) {
      name
    }
  }
`;

export interface EnsGraphClientOptions {
  apiKey: string;
  subgraphId: string;
  gatewayUrl?: string;
  timeoutMs?: number;
  maxNames?: number;
  fetch?: typeof fetch;
}

function normalizeAddress(address: string): string {
  if (!EVM_ADDRESS.test(address)) {
    throw new OnchainSignalProviderError(
      'invalid_provider_response',
      'Wallet address is not a valid EVM address',
    );
  }

  return address.toLowerCase();
}

function readableNames(input: Array<{ name?: string | null | undefined }>): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const record of input) {
    const name = record.name?.trim();
    const normalized = name?.toLowerCase();

    if (!name || !normalized || UNNORMALIZED_LABEL.test(normalized) || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    names.push(name);
  }

  return names;
}

export class EnsGraphClient implements EnsNameReaderPort {
  private readonly fetchImplementation: typeof fetch;
  private readonly endpoint: string;
  private readonly sourceRef: string;

  constructor(private readonly options: EnsGraphClientOptions) {
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.endpoint = `${(options.gatewayUrl ?? 'https://gateway.thegraph.com/api').replace(
      /\/$/,
      '',
    )}/${encodeURIComponent(options.apiKey)}/subgraphs/id/${encodeURIComponent(
      options.subgraphId,
    )}`;
    this.sourceRef = `the-graph:ens:ethereum:${options.subgraphId}`;
  }

  async listOwnedNames(address: string): Promise<EnsNameSignal> {
    const owner = normalizeAddress(address);
    const maxNames = this.options.maxNames ?? 5;
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
          query: OWNED_ENS_NAMES_QUERY,
          variables: {
            owner,
            first: maxNames + 1,
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
          'The Graph gateway response did not match the ENS schema',
        );
      }

      const names = readableNames([
        ...parsed.data.data.domains,
        ...parsed.data.data.wrappedDomains,
      ]);

      return {
        provider: 'the_graph',
        dataset: 'ens',
        network: 'ethereum',
        subgraphId: this.options.subgraphId,
        sourceRef: this.sourceRef,
        ownedNames: names.slice(0, maxNames),
        truncated: names.length > maxNames,
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

      throw new OnchainSignalProviderError('provider_unavailable', 'The Graph ENS query failed');
    } finally {
      clearTimeout(timeout);
    }
  }
}
