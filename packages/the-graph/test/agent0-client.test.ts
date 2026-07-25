import { OnchainSignalProviderError } from '@nook-rent/core';
import { describe, expect, it, vi } from 'vitest';

import { Agent0GraphClient } from '../src/agent0-client.js';

const AGENT_ADDRESS = '0x1111111111111111111111111111111111111111';
const API_KEY = 'graph-secret-test-key';
const SUBGRAPH_ID = '4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u';

function graphResponse(
  overrides: {
    active?: boolean;
    endpointsRawJson?: string;
  } = {},
) {
  return {
    data: {
      walletAgents: [
        {
          id: '84532:7',
          owner: AGENT_ADDRESS,
          operators: ['0x2222222222222222222222222222222222222222'],
          agentWallet: AGENT_ADDRESS,
          registrationFile: {
            active: overrides.active ?? true,
            endpointsRawJson:
              overrides.endpointsRawJson ??
              JSON.stringify([
                {
                  name: 'Nook.rent',
                  endpoint: 'https://nook.rent',
                  version: '1.0.0',
                  capabilities: ['reservation-hold', 'listing-search'],
                },
              ]),
            mcpTools: ['search_listings'],
            a2aSkills: [],
            oasfSkills: [],
          },
        },
      ],
      ownedAgents: [],
      operatorAgents: [],
    },
  };
}

function client(fetchImplementation: typeof fetch, now?: () => number) {
  return new Agent0GraphClient({
    apiKey: API_KEY,
    subgraphId: SUBGRAPH_ID,
    chainId: 84_532,
    network: 'base-sepolia',
    requiredCapability: 'nook.rent:reservation-hold',
    fetch: fetchImplementation,
    cacheTtlMs: 15_000,
    timeoutMs: 20,
    ...(now ? { now } : {}),
  });
}

describe('Agent0 Graph client', () => {
  it('maps a live wallet registration and advertised booking capability', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json(graphResponse())),
    );

    const signal = await client(fetchImplementation).getAgentRegistration(AGENT_ADDRESS);

    expect(signal).toEqual({
      active: true,
      agentAddress: AGENT_ADDRESS,
      operatorAddresses: ['0x2222222222222222222222222222222222222222'],
      capabilities: [
        'mcp:search_listings',
        'nook.rent:listing-search',
        'nook.rent:reservation-hold',
      ],
      sourceRef: `the-graph:agent0:base-sepolia:${SUBGRAPH_ID}`,
      chainId: 84_532,
      subgraphId: SUBGRAPH_ID,
      network: 'base-sepolia',
      binding: 'agent_wallet',
    });

    const [url, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBeTypeOf('string');
    expect(url as string).toContain(API_KEY);
    expect(request?.body).toContain('"address":"0x1111111111111111111111111111111111111111"');
    expect(signal?.sourceRef).not.toContain(API_KEY);
  });

  it('uses a short cache for repeated authorization checks', async () => {
    let now = 1_000;
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json(graphResponse())),
    );
    const graph = client(fetchImplementation, () => now);

    await graph.getAgentRegistration(AGENT_ADDRESS);
    now += 5_000;
    await graph.getAgentRegistration(AGENT_ADDRESS);

    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it('returns no signal when the signing wallet has no Agent0 registration', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({
          data: {
            walletAgents: [],
            ownedAgents: [],
            operatorAgents: [],
          },
        }),
      ),
    );

    await expect(
      client(fetchImplementation).getAgentRegistration(AGENT_ADDRESS),
    ).resolves.toBeUndefined();
  });

  it('does not grant a capability from malformed endpoint metadata', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json(
          graphResponse({
            endpointsRawJson: 'not-json',
          }),
        ),
      ),
    );

    const signal = await client(fetchImplementation).getAgentRegistration(AGENT_ADDRESS);

    expect(signal?.capabilities).toEqual(['mcp:search_listings']);
  });

  it('normalizes GraphQL errors without leaking provider details', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({
          errors: [{ message: `unauthorized API key ${API_KEY}` }],
        }),
      ),
    );

    await expect(client(fetchImplementation).getAgentRegistration(AGENT_ADDRESS)).rejects.toEqual(
      new OnchainSignalProviderError(
        'invalid_provider_response',
        'The Graph gateway response did not match the Agent0 schema',
      ),
    );
  });

  it('normalizes provider timeouts', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(
      (_input: Parameters<typeof fetch>[0], init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        }),
    );

    await expect(
      client(fetchImplementation).getAgentRegistration(AGENT_ADDRESS),
    ).rejects.toMatchObject({
      reason: 'provider_timeout',
      message: 'The Graph gateway query timed out',
    });
  });
});
