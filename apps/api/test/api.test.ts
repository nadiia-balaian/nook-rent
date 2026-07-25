import { afterEach, describe, expect, it } from 'vitest';
import {
  HumanBackedAuthorizationError,
  OnchainSignalProviderError,
  TokenAmount,
} from '@nook-rent/core';

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

  it('returns a constrained Host Agent draft that still requires confirmation', async () => {
    const application = createApi({
      marketplaceAgents: {
        createListingDraft: () =>
          Promise.resolve({
            draft: {
              title: 'A calm Graça home',
              description: 'A public description based on confirmed Host facts.',
              suggestedAmenities: ['workspace'],
              inferredFields: ['title', 'description', 'suggestedAmenities'],
            },
            execution: {
              provider: 'openai',
              mode: 'live',
              model: 'test-model',
            },
          }),
        search: () => Promise.reject(new Error('unused')),
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/listings/drafts',
      payload: {
        hostFacts: {
          city: 'Lisbon',
          neighborhood: 'Graça',
          propertyType: 'one-bedroom home',
          maxGuests: 2,
          confirmedAmenities: ['wifi'],
          houseRules: ['No smoking'],
          highlights: ['calm courtyard'],
        },
        imageRefs: [],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      draft: {
        title: 'A calm Graça home',
        suggestedAmenities: ['workspace'],
      },
      agent: {
        provider: 'openai',
        mode: 'live',
      },
      requiresHostConfirmation: true,
    });
  });

  it('returns only database-valid Listings from the Guest Agent search', async () => {
    const application = createApi({
      marketplaceAgents: {
        createListingDraft: () => Promise.reject(new Error('unused')),
        search: () =>
          Promise.resolve({
            status: 'ready',
            interpretation: {
              status: 'ready',
              city: 'Lisbon',
              checkIn: '2026-08-20',
              checkOut: '2026-08-25',
              guests: 1,
              maximumNightlyRateAtomic: '15000',
              requiredAmenities: ['wifi'],
            },
            interpretationExecution: {
              provider: 'openai',
              mode: 'live',
              model: 'test-model',
            },
            rankingExecution: {
              provider: 'deterministic',
              mode: 'fallback',
              fallbackReason: 'provider_unavailable',
            },
            totalMatches: 1,
            recommendations: [
              {
                listing: {
                  id: '30000000-0000-4000-8000-000000000001',
                  hostProfileId: '10000000-0000-4000-8000-000000000001',
                  title: 'Alfama work-friendly nook',
                  description: 'A calm room with a desk.',
                  city: 'Lisbon',
                  neighborhood: 'Alfama',
                  approximateLocationRef: 'lisbon-alfama-area',
                  amenities: ['wifi', 'desk'],
                  houseRules: ['No smoking'],
                  settlementTokenId: '0.0.7001',
                  nightlyRate: TokenAmount.fromAtomicUnits('10000'),
                  baseDeposit: TokenAmount.fromAtomicUnits('50000'),
                  maxGuests: 2,
                  status: 'published',
                  createdAt: '2026-07-25T10:00:00.000Z',
                  updatedAt: '2026-07-25T10:00:00.000Z',
                },
                summary: 'A valid work-friendly match.',
                matchReasons: ['Includes wifi'],
              },
            ],
          }),
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/agents/guest/search',
      payload: {
        query:
          'Find a stay in Lisbon from 2026-08-20 to 2026-08-25 for 1 guest under 15000 with wifi.',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: 'ready',
      totalMatches: 1,
      items: [
        {
          listing: {
            id: '30000000-0000-4000-8000-000000000001',
            nightlyRateAtomic: '10000',
          },
          summary: 'A valid work-friendly match.',
        },
      ],
      agent: {
        interpretation: { provider: 'openai', mode: 'live' },
        ranking: {
          provider: 'deterministic',
          mode: 'fallback',
          fallbackReason: 'provider_unavailable',
        },
      },
    });
  });

  it('rejects private or financial fields at the Host Agent boundary', async () => {
    const application = createApi({
      marketplaceAgents: {
        createListingDraft: () => Promise.reject(new Error('must not run')),
        search: () => Promise.reject(new Error('unused')),
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/listings/drafts',
      payload: {
        hostFacts: {
          city: 'Lisbon',
          neighborhood: 'Graça',
          propertyType: 'home',
          maxGuests: 2,
          confirmedAmenities: ['wifi'],
          houseRules: [],
          highlights: [],
          depositAmountAtomic: '1',
        },
        imageRefs: [],
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'validation_error',
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
