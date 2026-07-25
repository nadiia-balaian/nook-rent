import {
  type EnsNameReaderPort,
  type EnsNameSignal,
  OnchainSignalProviderError,
} from '@nook-rent/core';
import { z } from 'zod';

const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

const graphResponseSchema = z.object({
  data: z.object({
    domains: z.array(
      z.object({
        name: z.string().nullish(),
      }),
    ),
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

      const names = parsed.data.data.domains
        .map(({ name }) => name?.trim())
        .filter((name): name is string => Boolean(name));

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
