import { afterEach, describe, expect, it } from 'vitest';
import { HumanBackedAuthorizationError, OnchainSignalProviderError } from '@nook-rent/core';

import { createApi } from '../src/api.js';

const applications: ReturnType<typeof createApi>[] = [];
const worldResourceUri = 'https://api.nook.rent/v1/reservation-holds';

function verifiedWorldAuthorization() {
  return {
    createChallenge: () => ({ agentkit: {} }),
    verify: () =>
      Promise.resolve({
        provider: 'world_agentkit' as const,
        agentAddress: '0x1111111111111111111111111111111111111111',
        anonymousHumanRefHash: '1'.repeat(64),
        nonce: 'world-api-test-nonce',
      }),
  };
}

afterEach(async () => {
  await Promise.all(applications.splice(0).map(async (application) => application.close()));
});

describe('Nook API', () => {
  it('reports service health without external dependencies', async () => {
    const application = createApi();
    applications.push(application);

    const response = await application.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'nook-api',
      status: 'ok',
    });
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });

  it('reports that readiness is unavailable without a database adapter', async () => {
    const application = createApi();
    applications.push(application);

    const response = await application.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      service: 'nook-api',
      status: 'not_ready',
    });
  });

  it('uses a stable error envelope for unknown routes', async () => {
    const application = createApi();
    applications.push(application);

    const response = await application.inject({
      method: 'GET',
      url: '/does-not-exist',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: 'route_not_found',
        message: 'The requested API route does not exist',
      },
    });
    expect(response.json().error.requestId).toBeTypeOf('string');
  });

  it('keeps the Hedera deposit route unavailable until the provider is configured', async () => {
    const application = createApi();
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/bookings/70000000-0000-4000-8000-000000000001/deposit',
      headers: {
        'idempotency-key': 'deposit-not-configured',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: 'hedera_unavailable',
      },
    });
  });

  it('returns an AgentKit challenge before scarce dates can be held', async () => {
    const application = createApi({
      humanBackedAuthorization: {
        createChallenge: () => ({
          agentkit: {
            info: {
              uri: 'https://api.nook.rent/v1/reservation-holds',
              nonce: 'challenge-nonce',
            },
          },
        }),
        verify: () => Promise.reject(new Error('verify should not run without an AgentKit header')),
      },
      worldResourceUri: 'https://api.nook.rent/v1/reservation-holds',
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'world-challenge-request',
      },
      payload: {
        quoteId: '40000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(402);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toMatchObject({
      error: 'human_backed_authorization_required',
      resource: {
        url: 'https://api.nook.rent/v1/reservation-holds',
      },
      extensions: {
        agentkit: {
          info: {
            nonce: 'challenge-nonce',
          },
        },
      },
    });
  });

  it('rejects an Agent that is not human-backed', async () => {
    const application = createApi({
      humanBackedAuthorization: {
        createChallenge: () => ({ agentkit: {} }),
        verify: () =>
          Promise.reject(
            new HumanBackedAuthorizationError(
              'agent_not_human_backed',
              'AgentBook has no verified human for this Agent',
            ),
          ),
      },
      worldResourceUri: 'https://api.nook.rent/v1/reservation-holds',
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'world-unverified-request',
        agentkit: 'unverified-agent-proof',
      },
      payload: {
        quoteId: '40000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'agent_not_human_backed',
      },
    });
  });

  it('fails closed when The Graph registration check is not configured', async () => {
    const application = createApi({
      humanBackedAuthorization: verifiedWorldAuthorization(),
      worldResourceUri,
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'graph-not-configured',
        agentkit: 'verified-world-agent',
      },
      payload: {
        quoteId: '40000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: {
        code: 'provider_unavailable',
      },
    });
  });

  it('rejects a human-backed wallet without an Agent0 registration', async () => {
    const application = createApi({
      humanBackedAuthorization: verifiedWorldAuthorization(),
      worldResourceUri,
      agentRegistrationSignals: {
        getAgentRegistration: () => Promise.resolve(undefined),
      },
      requiredAgentCapability: 'nook.rent:reservation-hold',
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'graph-unregistered-agent',
        agentkit: 'verified-world-agent',
      },
      payload: {
        quoteId: '40000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'agent_not_registered',
      },
    });
  });

  it('rejects an inactive Agent0 registration', async () => {
    const application = createApi({
      humanBackedAuthorization: verifiedWorldAuthorization(),
      worldResourceUri,
      agentRegistrationSignals: {
        getAgentRegistration: (agentAddress) =>
          Promise.resolve({
            active: false,
            agentAddress,
            operatorAddresses: [],
            capabilities: ['nook.rent:reservation-hold'],
            sourceRef: 'the-graph:agent0:base-sepolia:test-subgraph',
            chainId: 84_532,
            subgraphId: 'test-subgraph',
            network: 'base-sepolia',
            binding: 'agent_wallet',
          }),
      },
      requiredAgentCapability: 'nook.rent:reservation-hold',
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'graph-inactive-agent',
        agentkit: 'verified-world-agent',
      },
      payload: {
        quoteId: '40000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'agent_registration_inactive',
      },
    });
  });

  it('rejects an Agent0 registration without the booking capability', async () => {
    const application = createApi({
      humanBackedAuthorization: verifiedWorldAuthorization(),
      worldResourceUri,
      agentRegistrationSignals: {
        getAgentRegistration: (agentAddress) =>
          Promise.resolve({
            active: true,
            agentAddress,
            operatorAddresses: [],
            capabilities: ['nook.rent:listing-search'],
            sourceRef: 'the-graph:agent0:base-sepolia:test-subgraph',
            chainId: 84_532,
            subgraphId: 'test-subgraph',
            network: 'base-sepolia',
            binding: 'agent_wallet',
          }),
      },
      requiredAgentCapability: 'nook.rent:reservation-hold',
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'graph-capability-missing',
        agentkit: 'verified-world-agent',
      },
      payload: {
        quoteId: '40000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'agent_capability_missing',
      },
    });
  });

  it('normalizes a Graph provider timeout without exposing provider details', async () => {
    const application = createApi({
      humanBackedAuthorization: verifiedWorldAuthorization(),
      worldResourceUri,
      agentRegistrationSignals: {
        getAgentRegistration: () =>
          Promise.reject(
            new OnchainSignalProviderError('provider_timeout', 'The Graph gateway query timed out'),
          ),
      },
      requiredAgentCapability: 'nook.rent:reservation-hold',
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'graph-provider-timeout',
        agentkit: 'verified-world-agent',
      },
      payload: {
        quoteId: '40000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: {
        code: 'provider_timeout',
        message: 'The Graph gateway query timed out',
      },
    });
  });
});
