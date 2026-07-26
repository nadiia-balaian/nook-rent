import { afterEach, describe, expect, it } from 'vitest';
import {
  type AgentPaymentMandate,
  type Booking,
  type DepositWorkflowResult,
  HumanBackedAuthorizationError,
  OnchainSignalProviderError,
  StayRange,
  TokenAmount,
} from '@nook-rent/core';
import { WorldIdVerificationError } from '@nook-rent/world';

import { createApi } from '../src/api.js';

const applications: ReturnType<typeof createApi>[] = [];
const worldResourceUri = 'https://api.nook.rent/v1/reservation-holds';
const hostProfileId = '10000000-0000-4000-8000-000000000001';

function verifiedMemberWorldId() {
  return {
    publicConfig: () => ({
      appId: 'app_nook_test' as const,
      rpId: 'rp_nook_test' as const,
      action: 'nook-member-onboarding',
      environment: 'staging' as const,
    }),
    createRpContext: () => ({
      rp_id: 'rp_nook_test',
      nonce: 'world-id-request-nonce',
      created_at: 1_784_990_000,
      expires_at: 1_784_990_300,
      signature: `0x${'a'.repeat(130)}`,
    }),
    verifyProof: () =>
      Promise.resolve({
        provider: 'world_id' as const,
        credential: 'proof_of_human' as const,
        environment: 'staging' as const,
        nullifierDecimal: '42',
        protocolVersion: '4.0' as const,
      }),
  };
}

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

  it('issues a no-store wallet-control challenge for consented public evidence', async () => {
    const challenge = {
      address: '0x1111111111111111111111111111111111111111',
      issuedAt: '2026-07-25T10:00:00.000Z',
      expiresAt: '2026-07-25T10:05:00.000Z',
      nonce: 'wallet-test-nonce',
      message: 'Nook.rent wallet evidence',
      integrity: `0x${'a'.repeat(64)}`,
    };
    const application = createApi({
      walletEvidence: {
        createChallenge: () => challenge,
        verifyWalletEvidence: () => Promise.reject(new Error('unused')),
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/wallet-verification/challenge',
      payload: {
        address: challenge.address,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual(challenge);
  });

  it('returns separately named ENS and POAP signals after wallet control is verified', async () => {
    const challenge = {
      address: '0x1111111111111111111111111111111111111111',
      issuedAt: '2026-07-25T10:00:00.000Z',
      expiresAt: '2026-07-25T10:05:00.000Z',
      nonce: 'wallet-test-nonce',
      message: 'Nook.rent wallet evidence',
      integrity: `0x${'a'.repeat(64)}`,
    };
    const result = {
      provider: 'poap_compass' as const,
      walletControl: {
        verified: true as const,
        address: challenge.address,
        verifiedAt: '2026-07-25T10:00:01.000Z',
      },
      signals: {
        totalPoaps: 3,
        distinctEvents: 3,
        activeYears: [2025, 2026],
        firstCollectedAt: '2025-01-01T00:00:00.000Z',
        latestCollectedAt: '2026-07-25T00:00:00.000Z',
        tokensWithRecordedTransfers: 0,
        totalRecordedTransfers: 0,
      },
      recentPoaps: [],
      truncated: false,
      theGraph: {
        provider: 'the_graph' as const,
        dataset: 'ens' as const,
        network: 'ethereum' as const,
        subgraphId: '5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH',
        sourceRef: 'the-graph:ens:ethereum:5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH',
        ownedNames: ['nook.eth'],
        truncated: false,
      },
    };
    const application = createApi({
      walletEvidence: {
        createChallenge: () => challenge,
        verifyWalletEvidence: () => Promise.resolve(result),
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/wallet-verification/evidence',
      payload: {
        challenge,
        signature: `0x${'b'.repeat(130)}`,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual(result);
    expect(response.json()).not.toHaveProperty('history');
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

  it('returns only safe World ID Member configuration and a signed RP context', async () => {
    const memberWorldId = verifiedMemberWorldId();
    const application = createApi({
      memberWorldId,
      worldIdVerifications: {
        isVerified: () => Promise.resolve(true),
        record: () => Promise.resolve('created'),
      },
    });
    applications.push(application);

    const config = await application.inject({
      method: 'GET',
      url: '/v1/world-id/member/config',
    });
    const rpContext = await application.inject({
      method: 'POST',
      url: '/v1/world-id/member/rp-signature',
    });

    expect(config.statusCode).toBe(200);
    expect(config.json()).toEqual(memberWorldId.publicConfig());
    expect(rpContext.statusCode).toBe(200);
    expect(rpContext.json()).toMatchObject({
      rp_id: 'rp_nook_test',
      nonce: 'world-id-request-nonce',
      signature: expect.stringMatching(/^0x/),
    });
    expect(JSON.stringify(config.json())).not.toContain('signing');
  });

  it('restores an existing World ID Member verification without exposing its nullifier', async () => {
    const application = createApi({
      memberWorldId: verifiedMemberWorldId(),
      worldIdVerifications: {
        isVerified: () => Promise.resolve(true),
        record: () => Promise.reject(new Error('unused')),
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'GET',
      url: `/v1/world-id/member/status?profileId=${hostProfileId}`,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      provider: 'world_id',
      credential: 'proof_of_human',
      humanVerified: true,
      environment: 'staging',
      status: 'existing',
    });
    expect(JSON.stringify(response.json())).not.toContain('nullifier');
  });

  it('does not let a fresh browser inherit verification from a known Member profile', async () => {
    const application = createApi({
      memberWorldId: verifiedMemberWorldId(),
      worldIdVerifications: {
        isVerified: () => Promise.resolve(true),
        record: () => Promise.reject(new Error('unused')),
      },
      memberSessions: {
        create: () => Promise.reject(new Error('unused')),
        findByTokenHash: () => Promise.resolve(undefined),
        authenticateWorldId: () => Promise.reject(new Error('unused')),
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'GET',
      url: `/v1/world-id/member/status?profileId=${hostProfileId}`,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: {
        code: 'member_session_required',
      },
    });
  });

  it('shares World verification only inside the authenticated Member session', async () => {
    const sessionsByHash = new Map<
      string,
      {
        id: string;
        profileId?: string;
        humanVerified: boolean;
        worldVerifiedAt?: string;
        expiresAt: string;
        createdAt: string;
        updatedAt: string;
      }
    >();
    const sessionsById = new Map<
      string,
      typeof sessionsByHash extends Map<string, infer T> ? T : never
    >();
    let expectedSignal: string | undefined;
    const memberWorldId = {
      ...verifiedMemberWorldId(),
      verifyProof: (input: { expectedSignal: string }) => {
        expectedSignal = input.expectedSignal;
        return verifiedMemberWorldId().verifyProof();
      },
    };
    const application = createApi({
      memberWorldId,
      worldIdVerifications: {
        isVerified: () => Promise.resolve(true),
        record: () => Promise.reject(new Error('session repository owns this write')),
      },
      memberSessions: {
        create: (input) => {
          const session = {
            id: input.id,
            humanVerified: false,
            expiresAt: input.expiresAt,
            createdAt: '2026-07-26T00:00:00.000Z',
            updatedAt: '2026-07-26T00:00:00.000Z',
          };
          sessionsByHash.set(input.tokenHash, session);
          sessionsById.set(input.id, session);
          return Promise.resolve(session);
        },
        findByTokenHash: (input) => Promise.resolve(sessionsByHash.get(input.tokenHash)),
        authenticateWorldId: (input) => {
          const session = sessionsById.get(input.sessionId);
          if (!session) throw new Error('Missing test session');
          session.profileId = hostProfileId;
          session.humanVerified = true;
          session.worldVerifiedAt = input.verifiedAt;
          session.updatedAt = input.verifiedAt;
          return Promise.resolve({
            session,
            status: 'existing' as const,
          });
        },
      },
    });
    applications.push(application);

    const firstCreated = await application.inject({
      method: 'POST',
      url: '/v1/member-sessions',
    });
    const first = firstCreated.json();
    const firstHeaders = {
      authorization: `Bearer ${first.token}`,
    };

    const beforeVerification = await application.inject({
      method: 'GET',
      url: '/v1/world-id/member/status',
      headers: firstHeaders,
    });
    expect(beforeVerification.json()).toEqual({
      humanVerified: false,
    });

    const verified = await application.inject({
      method: 'POST',
      url: '/v1/world-id/member/verify',
      headers: firstHeaders,
      payload: {
        proof: {
          protocol_version: '4.0',
          responses: [],
        },
      },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json()).toMatchObject({
      humanVerified: true,
      profileId: hostProfileId,
      status: 'existing',
    });
    expect(expectedSignal).toBe(first.session.id);

    const secondCreated = await application.inject({
      method: 'POST',
      url: '/v1/member-sessions',
    });
    const second = secondCreated.json();
    const secondStatus = await application.inject({
      method: 'GET',
      url: '/v1/world-id/member/status',
      headers: {
        authorization: `Bearer ${second.token}`,
      },
    });
    expect(secondStatus.json()).toEqual({
      humanVerified: false,
    });
  });

  it('verifies and stores a profile-bound World ID Member proof without exposing its nullifier', async () => {
    let stored: { profileId: string; nullifierDecimal: string } | undefined;
    const application = createApi({
      memberWorldId: verifiedMemberWorldId(),
      worldIdVerifications: {
        isVerified: () => Promise.resolve(true),
        record: (input) => {
          stored = {
            profileId: input.profileId,
            nullifierDecimal: input.nullifierDecimal,
          };
          return Promise.resolve('created');
        },
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/world-id/member/verify',
      payload: {
        profileId: hostProfileId,
        proof: {
          protocol_version: '4.0',
          responses: [],
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      provider: 'world_id',
      credential: 'proof_of_human',
      humanVerified: true,
      environment: 'staging',
      status: 'created',
    });
    expect(stored).toEqual({
      profileId: hostProfileId,
      nullifierDecimal: '42',
    });
    expect(JSON.stringify(response.json())).not.toContain('nullifier');
  });

  it('fails closed when World ID rejects the Member proof', async () => {
    const application = createApi({
      memberWorldId: {
        ...verifiedMemberWorldId(),
        verifyProof: () =>
          Promise.reject(
            new WorldIdVerificationError(
              'invalid_world_id_proof',
              'World ID could not verify this proof',
            ),
          ),
      },
      worldIdVerifications: {
        isVerified: () => Promise.resolve(true),
        record: () => Promise.reject(new Error('must not persist')),
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/world-id/member/verify',
      payload: {
        profileId: hostProfileId,
        proof: {
          protocol_version: '4.0',
          responses: [],
        },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: {
        code: 'invalid_world_id_proof',
      },
    });
  });

  it('requires World ID verification before a configured Host can create a Listing', async () => {
    const application = createApi({
      memberWorldId: verifiedMemberWorldId(),
      worldIdVerifications: {
        isVerified: () => Promise.resolve(false),
        record: () => Promise.reject(new Error('unused')),
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/listings',
      payload: {
        hostProfileId,
        title: 'A verified home',
        description: 'A calm temporary home in Lisbon.',
        city: 'Lisbon',
        neighborhood: 'Graça',
        approximateLocationRef: 'lisbon-graca-demo-area',
        amenities: ['wifi'],
        houseRules: ['No smoking'],
        settlementTokenId: '0.0.12345',
        nightlyRateAtomic: '11000',
        baseDepositAtomic: '50000',
        maxGuests: 2,
        availability: [
          {
            checkIn: '2026-09-05',
            checkOut: '2026-09-15',
          },
        ],
        approvalPolicy: {
          automaticApprovalEnabled: true,
          minimumRentalReputationTier: 'silver',
        },
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: 'world_id_verification_required',
      },
    });
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

  it('connects the configured human-backed Guest Agent without exposing identity details', async () => {
    const application = createApi({
      memberWorldId: verifiedMemberWorldId(),
      worldIdVerifications: {
        isVerified: () => Promise.resolve(true),
        record: () => Promise.reject(new Error('unused')),
      },
      worldGuestAgent: {
        getAgentAddress: () => '0x1111111111111111111111111111111111111111',
        getConnectionStatus: () =>
          Promise.resolve({
            provider: 'world_agentkit',
            humanBacked: true,
            network: 'world_chain',
          }),
        createReservationHold: () => Promise.reject(new Error('unused')),
      },
      agentRegistrationSignals: {
        getAgentRegistration: (agentAddress) =>
          Promise.resolve({
            active: true,
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
      url: '/v1/agents/guest/world-connection',
      payload: {
        profileId: '20000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      provider: 'world_agentkit',
      humanBacked: true,
      network: 'world_chain',
      onchainSignal: {
        provider: 'the_graph',
        subgraph: 'agent0',
        network: 'base-sepolia',
        chainId: 84_532,
        subgraphId: 'test-subgraph',
        sourceRef: 'the-graph:agent0:base-sepolia:test-subgraph',
        registered: true,
        active: true,
        binding: 'agent_wallet',
        requiredCapability: 'nook.rent:reservation-hold',
        capabilityPresent: true,
      },
    });
    expect(JSON.stringify(response.json())).not.toContain('address');
    expect(JSON.stringify(response.json())).not.toContain('humanId');
  });

  it('requires direct Member World ID verification before connecting a Guest Agent', async () => {
    const application = createApi({
      memberWorldId: verifiedMemberWorldId(),
      worldIdVerifications: {
        isVerified: () => Promise.resolve(false),
        record: () => Promise.reject(new Error('unused')),
      },
      worldGuestAgent: {
        getAgentAddress: () => '0x1111111111111111111111111111111111111111',
        getConnectionStatus: () => Promise.reject(new Error('must not connect')),
        createReservationHold: () => Promise.reject(new Error('unused')),
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/agents/guest/world-connection',
      payload: {
        profileId: '20000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: 'world_id_verification_required',
      },
    });
  });

  it('requires direct Member World ID verification before a Guest Agent can hold dates', async () => {
    const application = createApi({
      memberWorldId: verifiedMemberWorldId(),
      worldIdVerifications: {
        isVerified: () => Promise.resolve(false),
        record: () => Promise.reject(new Error('unused')),
      },
      marketplace: {
        getQuote: () =>
          Promise.resolve({
            id: '40000000-0000-4000-8000-000000000001',
            listingId: '30000000-0000-4000-8000-000000000001',
            guestProfileId: '20000000-0000-4000-8000-000000000001',
            stayRange: StayRange.fromStrings({
              checkIn: '2026-08-20',
              checkOut: '2026-08-25',
            }),
            settlementTokenId: '0.0.7001',
            nightlyRate: TokenAmount.fromAtomicUnits('10000'),
            staySubtotal: TokenAmount.fromAtomicUnits('50000'),
            baseDeposit: TokenAmount.fromAtomicUnits('50000'),
            quotedDeposit: TokenAmount.fromAtomicUnits('40000'),
            totalDue: TokenAmount.fromAtomicUnits('90000'),
            reputationTier: 'silver',
            expiresAt: '2026-07-25T10:15:00.000Z',
            createdAt: '2026-07-25T10:00:00.000Z',
          }),
      } as never,
      humanBackedAuthorization: {
        createChallenge: () => ({ agentkit: {} }),
        verify: () => Promise.reject(new Error('must not authorize')),
      },
      worldResourceUri,
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'unverified-member-hold',
      },
      payload: {
        quoteId: '40000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: 'world_id_verification_required',
      },
    });
  });

  it('lets a verified Guest Agent secure a match and autonomously fund its deposit', async () => {
    const listing = {
      id: '30000000-0000-4000-8000-000000000001',
      hostProfileId,
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
      status: 'published' as const,
      createdAt: '2026-07-25T10:00:00.000Z',
      updatedAt: '2026-07-25T10:00:00.000Z',
    };
    const quote = {
      id: '40000000-0000-4000-8000-000000000001',
      listingId: listing.id,
      guestProfileId: '20000000-0000-4000-8000-000000000001',
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-20',
        checkOut: '2026-08-25',
      }),
      settlementTokenId: listing.settlementTokenId,
      nightlyRate: TokenAmount.fromAtomicUnits('10000'),
      staySubtotal: TokenAmount.fromAtomicUnits('50000'),
      baseDeposit: TokenAmount.fromAtomicUnits('50000'),
      quotedDeposit: TokenAmount.fromAtomicUnits('40000'),
      totalDue: TokenAmount.fromAtomicUnits('90000'),
      reputationTier: 'silver' as const,
      expiresAt: '2026-07-25T10:15:00.000Z',
      createdAt: '2026-07-25T10:00:00.000Z',
    };
    const booking: Booking = {
      id: '70000000-0000-4000-8000-000000000001',
      listingId: listing.id,
      hostProfileId,
      guestProfileId: quote.guestProfileId,
      quoteId: quote.id,
      holdId: '50000000-0000-4000-8000-000000000001',
      stayRange: quote.stayRange,
      settlementTokenId: quote.settlementTokenId,
      staySubtotal: quote.staySubtotal,
      depositAmount: quote.quotedDeposit,
      status: 'awaiting_deposit',
      createdAt: quote.createdAt,
      updatedAt: quote.createdAt,
    };
    const hold = {
      id: booking.holdId,
      listingId: listing.id,
      guestProfileId: quote.guestProfileId,
      quoteId: quote.id,
      stayRange: quote.stayRange,
      status: 'active' as const,
      expiresAt: quote.expiresAt,
      createdAt: quote.createdAt,
      updatedAt: quote.createdAt,
    };
    let storedMandate: AgentPaymentMandate = {
      id: '80000000-0000-4000-8000-000000000001',
      idempotencyKey: 'payment:agent-secure-best-match',
      guestProfileId: booking.guestProfileId,
      agentAddress: '0x1111111111111111111111111111111111111111',
      bookingId: booking.id,
      quoteId: booking.quoteId,
      tokenId: booking.settlementTokenId,
      maximumDeposit: TokenAmount.fromAtomicUnits('75000'),
      status: 'active',
      expiresAt: hold.expiresAt,
      createdAt: quote.createdAt,
      updatedAt: quote.createdAt,
    };
    let receivedHold: { quoteId: string; idempotencyKey: string } | undefined;
    let receivedDeposit:
      | {
          bookingId: string;
          idempotencyKey: string;
          agentPaymentMandateId?: string;
        }
      | undefined;
    const depositResult = (): DepositWorkflowResult => ({
      snapshot: {
        operation: {
          id: '90000000-0000-4000-8000-000000000001',
          kind: 'hedera_deposit',
          idempotencyKey: `agent-payment:${storedMandate.id}`,
          aggregateType: 'booking',
          aggregateId: booking.id,
          provider: 'hedera',
          providerTransactionId: '0.0.1001@1784980800.000000001',
          status: 'confirmed',
          requestPayload: {
            bookingId: booking.id,
            agentPaymentMandateId: storedMandate.id,
          },
          attemptCount: 1,
          createdAt: quote.createdAt,
          updatedAt: quote.createdAt,
        },
        booking: {
          ...booking,
          status: 'confirmed',
        },
        hold: {
          ...hold,
          status: 'converted',
        },
        escrow: {
          id: '91000000-0000-4000-8000-000000000001',
          bookingId: booking.id,
          tokenId: booking.settlementTokenId,
          amount: booking.depositAmount,
          status: 'funded',
          fundedTransactionId: '0.0.1001@1784980800.000000001',
          createdAt: quote.createdAt,
          updatedAt: quote.createdAt,
        },
        payment: {
          id: '92000000-0000-4000-8000-000000000001',
          bookingId: booking.id,
          kind: 'deposit',
          tokenId: booking.settlementTokenId,
          amount: booking.depositAmount,
          recipientRef: '0.0.2002',
          status: 'confirmed',
          operationId: '90000000-0000-4000-8000-000000000001',
          createdAt: quote.createdAt,
          updatedAt: quote.createdAt,
        },
      },
      evidence: {
        status: 'confirmed',
        transactionId: '0.0.1001@1784980801.000000001',
        sequenceNumber: 14,
      },
      idempotent: false,
    });
    const application = createApi({
      memberWorldId: verifiedMemberWorldId(),
      worldIdVerifications: {
        isVerified: () => Promise.resolve(true),
        record: () => Promise.reject(new Error('unused')),
      },
      marketplace: {
        createQuote: () => Promise.resolve(quote),
        getBooking: () => Promise.resolve(booking),
      } as never,
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
              provider: 'openai',
              mode: 'live',
              model: 'test-model',
            },
            totalMatches: 1,
            recommendations: [
              {
                listing,
                summary: 'Best valid match within the Member mandate.',
                matchReasons: ['Within budget', 'Includes wifi'],
              },
            ],
          }),
      },
      worldGuestAgent: {
        getAgentAddress: () => '0x1111111111111111111111111111111111111111',
        getConnectionStatus: () => Promise.reject(new Error('unused')),
        createReservationHold: (input) => {
          receivedHold = input;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                status: 'created',
                approval: { status: 'auto_approved' },
                authorization: { provider: 'world_agentkit', humanBacked: true },
                booking: {
                  id: booking.id,
                  status: booking.status,
                },
                hold: {
                  id: hold.id,
                  status: hold.status,
                },
              }),
              {
                status: 201,
                headers: { 'content-type': 'application/json' },
              },
            ),
          );
        },
      },
      agentPaymentMandates: {
        authorize: (input) => {
          expect(input).toMatchObject({
            idempotencyKey: 'payment:agent-secure-best-match',
            bookingId: booking.id,
            maximumDeposit: TokenAmount.fromAtomicUnits('75000'),
          });
          return Promise.resolve({ status: 'created', mandate: storedMandate });
        },
        getForBooking: () => Promise.resolve(storedMandate),
      },
      deposits: {
        fundDeposit: (input) => {
          receivedDeposit = input;
          storedMandate = {
            ...storedMandate,
            status: 'consumed',
            operationId: '90000000-0000-4000-8000-000000000001',
            consumedAt: quote.createdAt,
          };
          return Promise.resolve(depositResult());
        },
        getDeposit: () => Promise.reject(new Error('unused')),
        reconcileDeposit: () => Promise.reject(new Error('unused')),
      },
      hederaTopicId: '0.0.8001',
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/agents/guest/secure-match',
      headers: {
        'idempotency-key': 'agent-secure-best-match',
      },
      payload: {
        guestProfileId: quote.guestProfileId,
        query:
          'Find a stay in Lisbon from 2026-08-20 to 2026-08-25 for 1 guest under 15000 with wifi.',
        paymentMandate: {
          authorized: true,
          maximumDepositAtomic: '75000',
        },
      },
    });

    expect(response.statusCode).toBe(201);
    expect(receivedHold).toEqual({
      quoteId: quote.id,
      idempotencyKey: 'agent-secure-best-match',
    });
    expect(receivedDeposit).toEqual({
      bookingId: booking.id,
      idempotencyKey: `agent-payment:${storedMandate.id}`,
      agentPaymentMandateId: storedMandate.id,
    });
    expect(response.json()).toMatchObject({
      status: 'secured',
      mandate: {
        city: 'Lisbon',
        checkIn: '2026-08-20',
        checkOut: '2026-08-25',
        maximumNightlyRateAtomic: '15000',
      },
      selectedMatch: {
        listing: {
          id: listing.id,
        },
      },
      quote: {
        id: quote.id,
      },
      reservation: {
        status: 'created',
        booking: {
          status: 'confirmed',
        },
        hold: {
          status: 'converted',
        },
        approval: {
          status: 'auto_approved',
        },
      },
      paymentMandate: {
        id: storedMandate.id,
        maximumDepositAtomic: '75000',
        status: 'consumed',
      },
      deposit: {
        operation: {
          status: 'confirmed',
        },
        evidence: {
          status: 'confirmed',
          sequenceNumber: 14,
        },
      },
    });
    expect(JSON.stringify(response.json())).not.toContain(storedMandate.agentAddress);
  });

  it('routes the browser request through the World-backed Guest Agent', async () => {
    let received:
      | {
          quoteId: string;
          idempotencyKey: string;
        }
      | undefined;
    const application = createApi({
      worldGuestAgent: {
        getAgentAddress: () => '0x1111111111111111111111111111111111111111',
        getConnectionStatus: () => Promise.reject(new Error('unused')),
        createReservationHold: (input) => {
          received = input;
          return Promise.resolve(
            new Response(
              JSON.stringify({
                status: 'created',
                authorization: {
                  provider: 'world_agentkit',
                  humanBacked: true,
                },
              }),
              {
                status: 201,
                headers: { 'content-type': 'application/json' },
              },
            ),
          );
        },
      },
    });
    applications.push(application);

    const response = await application.inject({
      method: 'POST',
      url: '/v1/agents/guest/reservation-holds',
      headers: {
        'idempotency-key': 'world-ui-agent-request',
      },
      payload: {
        quoteId: '40000000-0000-4000-8000-000000000001',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(received).toEqual({
      quoteId: '40000000-0000-4000-8000-000000000001',
      idempotencyKey: 'world-ui-agent-request',
    });
    expect(response.json()).toMatchObject({
      authorization: {
        provider: 'world_agentkit',
        humanBacked: true,
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
