import cors from '@fastify/cors';
import {
  AgentRegistrationError,
  type AgentRegistrationSignal,
  DomainConflictError,
  DomainValidationError,
  HumanBackedAuthorizationError,
  type HumanBackedAuthorizationPort,
  InvalidStateTransitionError,
  type Booking,
  type BookingDepositService,
  type BookingQuote,
  type DepositWorkflowResult,
  type Listing,
  type ListingDetail,
  type MarketplaceAgentService,
  type MarketplaceService,
  type OnchainSignalPort,
  OnchainSignalProviderError,
  type ReservationHold,
  ResourceNotFoundError,
  StayRange,
  TokenAmount,
} from '@nook-rent/core';
import { hederaTopicUrl, hederaTransactionUrl } from '@nook-rent/hedera';
import { InvalidWalletControlProofError, PoapHistoryProviderError } from '@nook-rent/poap';
import { WorldIdVerificationError } from '@nook-rent/world';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';

import type { WalletEvidenceService } from './wallet-evidence.js';

type MarketplaceApi = Pick<
  MarketplaceService,
  | 'createListingDraft'
  | 'createProfile'
  | 'createQuote'
  | 'decideBookingRequest'
  | 'getBooking'
  | 'getListing'
  | 'getQuote'
  | 'publishListing'
  | 'requestReservation'
  | 'searchListings'
>;

export interface CreateApiOptions {
  fastify?: FastifyInstance;
  logger?: boolean;
  allowedOrigins?: string[];
  marketplace?: MarketplaceApi;
  marketplaceAgents?: Pick<MarketplaceAgentService, 'createListingDraft' | 'search'>;
  deposits?: Pick<BookingDepositService, 'fundDeposit' | 'getDeposit' | 'reconcileDeposit'>;
  hederaTopicId?: string;
  humanBackedAuthorization?: HumanBackedAuthorizationPort & {
    createChallenge(): object;
  };
  worldGuestAgent?: {
    getAgentAddress(): string;
    getConnectionStatus(): Promise<{
      provider: 'world_agentkit';
      humanBacked: true;
      network: 'world_chain';
    }>;
    createReservationHold(input: { quoteId: string; idempotencyKey: string }): Promise<Response>;
  };
  memberWorldId?: {
    publicConfig(): {
      appId: `app_${string}`;
      rpId: `rp_${string}`;
      action: string;
      environment: 'production' | 'staging' | 'sandbox';
    };
    createRpContext(): {
      rp_id: string;
      nonce: string;
      created_at: number;
      expires_at: number;
      signature: string;
    };
    verifyProof(input: { proof: unknown; expectedSignal: string }): Promise<{
      provider: 'world_id';
      credential: 'proof_of_human';
      environment: 'production' | 'staging' | 'sandbox';
      nullifierDecimal: string;
      protocolVersion: '3.0' | '4.0';
    }>;
  };
  worldIdVerifications?: {
    isVerified(input: { profileId: string; action: string }): Promise<boolean>;
    record(input: {
      profileId: string;
      provider: 'world_id';
      credential: 'proof_of_human';
      action: string;
      environment: 'production' | 'staging' | 'sandbox';
      protocolVersion: '3.0' | '4.0';
      nullifierDecimal: string;
      verifiedAt: string;
    }): Promise<'created' | 'idempotent'>;
  };
  worldResourceUri?: string;
  agentRegistrationSignals?: OnchainSignalPort;
  requiredAgentCapability?: string;
  walletEvidence?: Pick<WalletEvidenceService, 'createChallenge' | 'verifyPoapCollection'>;
  readiness?: () => Promise<void>;
}

const uuid = z.uuid();
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const atomicUnits = z.string().regex(/^\d+$/);
const reputationTier = z.enum(['newcomer', 'bronze', 'silver', 'gold']);

const profileBody = z.object({
  role: z.enum(['host', 'guest', 'both']),
  publicRef: z.string().trim().min(3).max(120),
});

const listingBody = z.object({
  hostProfileId: uuid,
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(1).max(5000),
  city: z.string().trim().min(1).max(120),
  neighborhood: z.string().trim().max(120).default(''),
  approximateLocationRef: z.string().trim().min(1).max(200),
  amenities: z.array(z.string().trim().min(1).max(80)).max(100).default([]),
  houseRules: z.array(z.string().trim().min(1).max(300)).max(100).default([]),
  settlementTokenId: z.string().trim().min(3).max(120),
  nightlyRateAtomic: atomicUnits,
  baseDepositAtomic: atomicUnits,
  maxGuests: z.number().int().min(1).max(100),
  availability: z
    .array(
      z.object({
        checkIn: localDate,
        checkOut: localDate,
      }),
    )
    .min(1)
    .max(100),
  approvalPolicy: z.object({
    automaticApprovalEnabled: z.boolean(),
    minimumRentalReputationTier: reputationTier,
  }),
});

const listingParams = z.object({ listingId: uuid });
const bookingParams = z.object({ bookingId: uuid });
const operationParams = z.object({ operationId: uuid });
const bookingRequestParams = z.object({ requestId: uuid });

const listingSearchQuery = z.object({
  city: z.string().trim().min(1),
  checkIn: localDate,
  checkOut: localDate,
  guests: z.coerce.number().int().min(1).max(100),
  maximumNightlyRateAtomic: atomicUnits.optional(),
  amenities: z.string().optional(),
});

const quoteBody = z.object({
  listingId: uuid,
  guestProfileId: uuid,
  checkIn: localDate,
  checkOut: localDate,
});

const holdBody = z.object({
  quoteId: uuid,
});

const worldIdProofBody = z
  .object({
    profileId: uuid,
    proof: z.unknown(),
  })
  .strict();

const decisionBody = z.object({
  hostProfileId: uuid,
  decision: z.enum(['approved', 'rejected']),
});

const publicImageRef = z
  .url()
  .refine((value) => new URL(value).protocol === 'https:', 'imageRefs must use HTTPS')
  .refine((value) => {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1';
  }, 'imageRefs must use a public hostname');

const listingAgentDraftBody = z
  .object({
    hostFacts: z
      .object({
        city: z.string().trim().min(1).max(120),
        neighborhood: z.string().trim().min(1).max(120),
        propertyType: z.string().trim().min(1).max(80),
        maxGuests: z.number().int().min(1).max(100),
        confirmedAmenities: z.array(z.string().trim().min(1).max(80)).max(40),
        houseRules: z.array(z.string().trim().min(1).max(300)).max(40),
        highlights: z.array(z.string().trim().min(1).max(300)).max(12),
      })
      .strict(),
    imageRefs: z.array(publicImageRef).max(4).default([]),
  })
  .strict();

const guestAgentSearchBody = z
  .object({
    query: z.string().trim().min(3).max(1_000),
  })
  .strict();

const worldConnectionBody = z
  .object({
    profileId: uuid,
  })
  .strict();

const evmAddress = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const walletChallengeBody = z
  .object({
    address: evmAddress,
  })
  .strict();
const walletChallenge = z
  .object({
    address: evmAddress,
    issuedAt: z.iso.datetime(),
    expiresAt: z.iso.datetime(),
    nonce: z.string().min(8).max(200),
    message: z.string().min(1).max(2_000),
    integrity: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  })
  .strict();
const walletPoapBody = z
  .object({
    challenge: walletChallenge,
    signature: z.string().regex(/^0x[a-fA-F0-9]+$/),
  })
  .strict();

const guestAgentSecureMatchBody = z
  .object({
    guestProfileId: uuid,
    query: z.string().trim().min(3).max(1_000),
  })
  .strict();

function errorEnvelope(request: FastifyRequest, code: string, message: string, details?: unknown) {
  return {
    error: {
      code,
      message,
      requestId: request.id,
      ...(details === undefined ? {} : { details }),
    },
  };
}

function requireMarketplace(
  marketplace: MarketplaceApi | undefined,
  request: FastifyRequest,
): MarketplaceApi {
  if (!marketplace) {
    throw new DomainConflictError(
      'marketplace_unavailable',
      `Marketplace is unavailable for request ${request.id}`,
    );
  }

  return marketplace;
}

function requireDeposits(
  deposits: CreateApiOptions['deposits'],
  request: FastifyRequest,
): NonNullable<CreateApiOptions['deposits']> {
  if (!deposits) {
    throw new DomainConflictError(
      'hedera_unavailable',
      `Hedera Testnet deposits are unavailable for request ${request.id}`,
    );
  }

  return deposits;
}

function requireMarketplaceAgents(
  marketplaceAgents: CreateApiOptions['marketplaceAgents'],
  request: FastifyRequest,
): NonNullable<CreateApiOptions['marketplaceAgents']> {
  if (!marketplaceAgents) {
    throw new DomainConflictError(
      'agents_unavailable',
      `Marketplace Agents are unavailable for request ${request.id}`,
    );
  }

  return marketplaceAgents;
}

function requireHumanBackedAuthorization(
  authorization: CreateApiOptions['humanBackedAuthorization'],
  resourceUri: string | undefined,
  request: FastifyRequest,
): {
  authorization: NonNullable<CreateApiOptions['humanBackedAuthorization']>;
  resourceUri: string;
} {
  if (!authorization || !resourceUri) {
    throw new DomainConflictError(
      'world_unavailable',
      `World AgentKit authorization is unavailable for request ${request.id}`,
    );
  }

  return { authorization, resourceUri };
}

function requireWorldGuestAgent(
  agent: CreateApiOptions['worldGuestAgent'],
  request: FastifyRequest,
): NonNullable<CreateApiOptions['worldGuestAgent']> {
  if (!agent) {
    throw new DomainConflictError(
      'world_unavailable',
      `The World-backed Guest Agent is unavailable for request ${request.id}`,
    );
  }

  return agent;
}

function requireMemberWorldId(
  verification: CreateApiOptions['memberWorldId'],
  repository: CreateApiOptions['worldIdVerifications'],
  request: FastifyRequest,
): {
  verification: NonNullable<CreateApiOptions['memberWorldId']>;
  repository: NonNullable<CreateApiOptions['worldIdVerifications']>;
} {
  if (!verification || !repository) {
    throw new DomainConflictError(
      'world_id_unavailable',
      `World ID Member verification is unavailable for request ${request.id}`,
    );
  }

  return { verification, repository };
}

async function requireVerifiedMember(input: {
  verification: NonNullable<CreateApiOptions['memberWorldId']>;
  repository: NonNullable<CreateApiOptions['worldIdVerifications']>;
  profileId: string;
  request: FastifyRequest;
}): Promise<void> {
  const verified = await input.repository.isVerified({
    profileId: input.profileId,
    action: input.verification.publicConfig().action,
  });

  if (!verified) {
    throw new DomainConflictError(
      'world_id_verification_required',
      `The Member must complete World ID verification before this action (${input.request.id})`,
    );
  }
}

async function requireAgentRegistration(input: {
  signals: OnchainSignalPort | undefined;
  requiredCapability: string | undefined;
  agentAddress: string;
}): Promise<AgentRegistrationSignal> {
  if (!input.signals || !input.requiredCapability) {
    throw new OnchainSignalProviderError(
      'provider_unavailable',
      'The Graph Agent0 registration check is not configured',
    );
  }

  const signal = await input.signals.getAgentRegistration(input.agentAddress);

  if (!signal) {
    throw new AgentRegistrationError(
      'agent_not_registered',
      'The signing Agent wallet is not registered in Agent0',
    );
  }
  if (!signal.active) {
    throw new AgentRegistrationError(
      'agent_registration_inactive',
      'The Agent0 registration is not active',
    );
  }
  if (!signal.capabilities.includes(input.requiredCapability)) {
    throw new AgentRegistrationError(
      'agent_capability_missing',
      `The Agent0 registration does not advertise ${input.requiredCapability}`,
    );
  }

  return signal;
}

function graphSignalDto(signal: AgentRegistrationSignal, requiredCapability: string) {
  return {
    provider: 'the_graph' as const,
    subgraph: 'agent0' as const,
    network: signal.network,
    chainId: signal.chainId,
    subgraphId: signal.subgraphId,
    sourceRef: signal.sourceRef,
    registered: true as const,
    active: true as const,
    binding: signal.binding,
    requiredCapability,
    capabilityPresent: true as const,
  };
}

function stayRangeDto(stayRange: StayRange) {
  return {
    checkIn: stayRange.checkIn.toString(),
    checkOut: stayRange.checkOut.toString(),
    nights: stayRange.nights,
  };
}

function listingDto(listing: Listing) {
  return {
    ...listing,
    nightlyRateAtomic: listing.nightlyRate.toString(),
    baseDepositAtomic: listing.baseDeposit.toString(),
    nightlyRate: undefined,
    baseDeposit: undefined,
  };
}

function listingDetailDto(detail: ListingDetail) {
  return {
    listing: listingDto(detail.listing),
    availability: detail.availability.map((window) => ({
      id: window.id,
      ...stayRangeDto(window.stayRange),
      createdAt: window.createdAt,
    })),
    approvalPolicy: detail.approvalPolicy,
  };
}

function quoteDto(quote: BookingQuote) {
  return {
    id: quote.id,
    listingId: quote.listingId,
    guestProfileId: quote.guestProfileId,
    ...stayRangeDto(quote.stayRange),
    settlementTokenId: quote.settlementTokenId,
    nightlyRateAtomic: quote.nightlyRate.toString(),
    staySubtotalAtomic: quote.staySubtotal.toString(),
    baseDepositAtomic: quote.baseDeposit.toString(),
    quotedDepositAtomic: quote.quotedDeposit.toString(),
    totalDueAtomic: quote.totalDue.toString(),
    reputationTier: quote.reputationTier,
    expiresAt: quote.expiresAt,
    createdAt: quote.createdAt,
  };
}

function holdDto(hold: ReservationHold) {
  return {
    ...hold,
    ...stayRangeDto(hold.stayRange),
    stayRange: undefined,
  };
}

function bookingDto(booking: Booking) {
  return {
    ...booking,
    ...stayRangeDto(booking.stayRange),
    stayRange: undefined,
    staySubtotalAtomic: booking.staySubtotal.toString(),
    depositAmountAtomic: booking.depositAmount.toString(),
    staySubtotal: undefined,
    depositAmount: undefined,
  };
}

function depositDto(result: DepositWorkflowResult, topicId?: string) {
  const { snapshot } = result;
  const transactionId = snapshot.operation.providerTransactionId;
  const evidenceTransactionId =
    result.evidence.status === 'not_started' ? undefined : result.evidence.transactionId;

  return {
    idempotent: result.idempotent,
    operation: {
      id: snapshot.operation.id,
      status: snapshot.operation.status,
      transactionId,
      ...(transactionId ? { transactionUrl: hederaTransactionUrl(transactionId) } : {}),
      failureCode: snapshot.operation.failureCode,
      attemptCount: snapshot.operation.attemptCount,
      nextAttemptAt: snapshot.operation.nextAttemptAt,
      createdAt: snapshot.operation.createdAt,
      updatedAt: snapshot.operation.updatedAt,
    },
    escrow: {
      id: snapshot.escrow.id,
      tokenId: snapshot.escrow.tokenId,
      amountAtomic: snapshot.escrow.amount.toString(),
      status: snapshot.escrow.status,
      fundedTransactionId: snapshot.escrow.fundedTransactionId,
    },
    payment: {
      id: snapshot.payment.id,
      tokenId: snapshot.payment.tokenId,
      amountAtomic: snapshot.payment.amount.toString(),
      status: snapshot.payment.status,
    },
    booking: bookingDto(snapshot.booking),
    hold: holdDto(snapshot.hold),
    evidence: {
      ...result.evidence,
      ...(evidenceTransactionId
        ? { transactionUrl: hederaTransactionUrl(evidenceTransactionId) }
        : {}),
      ...(topicId
        ? {
            topicId,
            topicUrl: hederaTopicUrl(topicId),
          }
        : {}),
    },
  };
}

export function createApi(options: CreateApiOptions = {}): FastifyInstance {
  const app =
    options.fastify ??
    Fastify({
      logger: options.logger ?? false,
    });

  void app.register(cors, {
    origin: options.allowedOrigins?.length ? options.allowedOrigins : false,
  });

  app.addHook('onRequest', (request, reply, done) => {
    void reply.header('x-request-id', request.id);
    done();
  });

  app.get('/health', () => ({
    service: 'nook-api',
    status: 'ok',
  }));

  app.get('/ready', async (_request, reply) => {
    if (!options.readiness) {
      return reply.code(503).send({
        service: 'nook-api',
        status: 'not_ready',
      });
    }

    try {
      await options.readiness();
      return {
        service: 'nook-api',
        status: 'ready',
      };
    } catch {
      return reply.code(503).send({
        service: 'nook-api',
        status: 'not_ready',
      });
    }
  });

  app.post('/v1/profiles', async (request, reply) => {
    const input = profileBody.parse(request.body);
    const profile = await requireMarketplace(options.marketplace, request).createProfile(input);
    return reply.code(201).send(profile);
  });

  app.post('/v1/wallet-verification/challenge', async (request, reply) => {
    const input = walletChallengeBody.parse(request.body);

    if (!options.walletEvidence) {
      throw new DomainConflictError(
        'wallet_evidence_unavailable',
        `Wallet evidence is unavailable for request ${request.id}`,
      );
    }

    return reply
      .header('cache-control', 'no-store')
      .code(201)
      .send(options.walletEvidence.createChallenge(input.address));
  });

  app.post('/v1/wallet-verification/poap', async (request, reply) => {
    const input = walletPoapBody.parse(request.body);

    if (!options.walletEvidence) {
      throw new DomainConflictError(
        'wallet_evidence_unavailable',
        `Wallet evidence is unavailable for request ${request.id}`,
      );
    }

    return reply
      .header('cache-control', 'no-store')
      .send(await options.walletEvidence.verifyPoapCollection(input));
  });

  app.post('/v1/listings/drafts', async (request) => {
    const input = listingAgentDraftBody.parse(request.body);
    const result = await requireMarketplaceAgents(
      options.marketplaceAgents,
      request,
    ).createListingDraft(input);

    return {
      draft: result.draft,
      agent: result.execution,
      requiresHostConfirmation: true,
    };
  });

  app.post('/v1/listings', async (request, reply) => {
    const input = listingBody.parse(request.body);

    if (options.memberWorldId || options.worldIdVerifications) {
      const worldId = requireMemberWorldId(
        options.memberWorldId,
        options.worldIdVerifications,
        request,
      );
      await requireVerifiedMember({
        verification: worldId.verification,
        repository: worldId.repository,
        profileId: input.hostProfileId,
        request,
      });
    }

    const detail = await requireMarketplace(options.marketplace, request).createListingDraft({
      ...input,
      nightlyRate: TokenAmount.fromAtomicUnits(input.nightlyRateAtomic),
      baseDeposit: TokenAmount.fromAtomicUnits(input.baseDepositAtomic),
      availability: input.availability.map((range) => StayRange.fromStrings(range)),
    });

    return reply.code(201).send(listingDetailDto(detail));
  });

  app.post('/v1/listings/:listingId/publish', async (request) => {
    const { listingId } = listingParams.parse(request.params);
    const detail = await requireMarketplace(options.marketplace, request).publishListing(listingId);
    return listingDetailDto(detail);
  });

  app.get('/v1/listings', async (request) => {
    const query = listingSearchQuery.parse(request.query);
    const listings = await requireMarketplace(options.marketplace, request).searchListings({
      city: query.city,
      stayRange: StayRange.fromStrings({
        checkIn: query.checkIn,
        checkOut: query.checkOut,
      }),
      ...(query.maximumNightlyRateAtomic
        ? {
            maximumNightlyRate: TokenAmount.fromAtomicUnits(query.maximumNightlyRateAtomic),
          }
        : {}),
      guests: query.guests,
      requiredAmenities:
        query.amenities
          ?.split(',')
          .map((amenity) => amenity.trim())
          .filter(Boolean) ?? [],
    });

    return {
      items: listings.map(listingDto),
    };
  });

  app.post('/v1/agents/guest/search', async (request) => {
    const input = guestAgentSearchBody.parse(request.body);
    const result = await requireMarketplaceAgents(options.marketplaceAgents, request).search(input);

    if (result.status === 'needs_clarification') {
      return {
        status: result.status,
        question: result.question,
        agent: {
          interpretation: result.interpretationExecution,
        },
      };
    }

    return {
      status: result.status,
      interpretation: result.interpretation,
      totalMatches: result.totalMatches,
      items: result.recommendations.map((recommendation) => ({
        listing: listingDto(recommendation.listing),
        summary: recommendation.summary,
        matchReasons: recommendation.matchReasons,
      })),
      agent: {
        interpretation: result.interpretationExecution,
        ranking: result.rankingExecution,
      },
    };
  });

  app.get('/v1/listings/:listingId', async (request) => {
    const { listingId } = listingParams.parse(request.params);
    const detail = await requireMarketplace(options.marketplace, request).getListing(listingId);
    return listingDetailDto(detail);
  });

  app.post('/v1/booking-quotes', async (request, reply) => {
    const input = quoteBody.parse(request.body);
    const quote = await requireMarketplace(options.marketplace, request).createQuote({
      listingId: input.listingId,
      guestProfileId: input.guestProfileId,
      stayRange: StayRange.fromStrings({
        checkIn: input.checkIn,
        checkOut: input.checkOut,
      }),
    });

    return reply.code(201).send(quoteDto(quote));
  });

  const getWorldIdMemberConfig = (request: FastifyRequest) => {
    const worldId = requireMemberWorldId(
      options.memberWorldId,
      options.worldIdVerifications,
      request,
    );

    return worldId.verification.publicConfig();
  };

  const createWorldIdMemberRpContext = (request: FastifyRequest) => {
    const worldId = requireMemberWorldId(
      options.memberWorldId,
      options.worldIdVerifications,
      request,
    );

    return worldId.verification.createRpContext();
  };

  const verifyWorldIdMember = async (request: FastifyRequest) => {
    const input = worldIdProofBody.parse(request.body);
    const worldId = requireMemberWorldId(
      options.memberWorldId,
      options.worldIdVerifications,
      request,
    );
    const config = worldId.verification.publicConfig();
    const verified = await worldId.verification.verifyProof({
      proof: input.proof,
      expectedSignal: input.profileId,
    });
    const status = await worldId.repository.record({
      profileId: input.profileId,
      provider: verified.provider,
      credential: verified.credential,
      action: config.action,
      environment: verified.environment,
      protocolVersion: verified.protocolVersion,
      nullifierDecimal: verified.nullifierDecimal,
      verifiedAt: new Date().toISOString(),
    });

    return {
      provider: verified.provider,
      credential: verified.credential,
      humanVerified: true,
      environment: verified.environment,
      status,
    };
  };

  app.get('/v1/world-id/member/config', getWorldIdMemberConfig);
  app.post('/v1/world-id/member/rp-signature', createWorldIdMemberRpContext);
  app.post('/v1/world-id/member/verify', verifyWorldIdMember);

  // Keep the original Host URLs during the deployed client transition.
  app.get('/v1/world-id/host/config', getWorldIdMemberConfig);
  app.post('/v1/world-id/host/rp-signature', createWorldIdMemberRpContext);
  app.post('/v1/world-id/host/verify', verifyWorldIdMember);

  app.post('/v1/agents/guest/world-connection', async (request) => {
    const input = worldConnectionBody.parse(request.body);
    const memberWorldId = requireMemberWorldId(
      options.memberWorldId,
      options.worldIdVerifications,
      request,
    );
    await requireVerifiedMember({
      verification: memberWorldId.verification,
      repository: memberWorldId.repository,
      profileId: input.profileId,
      request,
    });
    const agent = requireWorldGuestAgent(options.worldGuestAgent, request);
    const world = await agent.getConnectionStatus();
    const graphSignal = await requireAgentRegistration({
      signals: options.agentRegistrationSignals,
      requiredCapability: options.requiredAgentCapability,
      agentAddress: agent.getAgentAddress(),
    });

    return {
      ...world,
      onchainSignal: graphSignalDto(graphSignal, options.requiredAgentCapability ?? 'unconfigured'),
    };
  });

  app.post('/v1/agents/guest/secure-match', async (request, reply) => {
    const input = guestAgentSecureMatchBody.parse(request.body);
    const idempotencyKey = z.string().min(8).max(200).parse(request.headers['idempotency-key']);
    const memberWorldId = requireMemberWorldId(
      options.memberWorldId,
      options.worldIdVerifications,
      request,
    );
    await requireVerifiedMember({
      verification: memberWorldId.verification,
      repository: memberWorldId.repository,
      profileId: input.guestProfileId,
      request,
    });

    const marketplace = requireMarketplace(options.marketplace, request);
    const searchResult = await requireMarketplaceAgents(options.marketplaceAgents, request).search({
      query: input.query,
    });

    if (searchResult.status === 'needs_clarification') {
      return {
        status: 'needs_clarification',
        question: searchResult.question,
        agent: {
          interpretation: searchResult.interpretationExecution,
        },
      };
    }

    const [selectedMatch] = searchResult.recommendations;

    if (!selectedMatch) {
      return {
        status: 'no_match',
        mandate: searchResult.interpretation,
        totalMatches: searchResult.totalMatches,
        agent: {
          interpretation: searchResult.interpretationExecution,
          ranking: searchResult.rankingExecution,
        },
      };
    }

    const quote = await marketplace.createQuote({
      listingId: selectedMatch.listing.id,
      guestProfileId: input.guestProfileId,
      stayRange: StayRange.fromStrings({
        checkIn: searchResult.interpretation.checkIn,
        checkOut: searchResult.interpretation.checkOut,
      }),
    });
    const agentResponse = await requireWorldGuestAgent(
      options.worldGuestAgent,
      request,
    ).createReservationHold({
      quoteId: quote.id,
      idempotencyKey,
    });
    const reservation: unknown = await agentResponse.json();

    if (!agentResponse.ok) {
      return reply.header('cache-control', 'no-store').code(agentResponse.status).send(reservation);
    }

    return reply
      .header('cache-control', 'no-store')
      .code(agentResponse.status)
      .send({
        status: 'secured',
        mandate: searchResult.interpretation,
        selectedMatch: {
          listing: listingDto(selectedMatch.listing),
          summary: selectedMatch.summary,
          matchReasons: selectedMatch.matchReasons,
        },
        quote: quoteDto(quote),
        reservation,
        agent: {
          interpretation: searchResult.interpretationExecution,
          ranking: searchResult.rankingExecution,
        },
      });
  });

  app.post('/v1/agents/guest/reservation-holds', async (request, reply) => {
    const input = holdBody.parse(request.body);
    const idempotencyKey = z.string().min(8).max(200).parse(request.headers['idempotency-key']);
    const response = await requireWorldGuestAgent(
      options.worldGuestAgent,
      request,
    ).createReservationHold({
      quoteId: input.quoteId,
      idempotencyKey,
    });
    const body: unknown = await response.json();

    return reply.header('cache-control', 'no-store').code(response.status).send(body);
  });

  app.post('/v1/reservation-holds', async (request, reply) => {
    const input = holdBody.parse(request.body);
    const idempotencyKey = z.string().min(8).max(200).parse(request.headers['idempotency-key']);

    if (options.memberWorldId || options.worldIdVerifications) {
      const marketplace = requireMarketplace(options.marketplace, request);
      const quote = await marketplace.getQuote(input.quoteId);
      const memberWorldId = requireMemberWorldId(
        options.memberWorldId,
        options.worldIdVerifications,
        request,
      );
      await requireVerifiedMember({
        verification: memberWorldId.verification,
        repository: memberWorldId.repository,
        profileId: quote.guestProfileId,
        request,
      });
    }

    const world = requireHumanBackedAuthorization(
      options.humanBackedAuthorization,
      options.worldResourceUri,
      request,
    );
    const agentkitHeader = request.headers.agentkit;

    if (typeof agentkitHeader !== 'string' || agentkitHeader.length === 0) {
      return reply
        .header('cache-control', 'no-store')
        .code(402)
        .send({
          x402Version: 2,
          error: 'human_backed_authorization_required',
          resource: {
            url: world.resourceUri,
            description:
              'A World-verified human-backed Guest Agent is required to hold scarce dates.',
            mimeType: 'application/json',
          },
          accepts: [],
          extensions: world.authorization.createChallenge(),
        });
    }

    const authorization = await world.authorization.verify({
      header: agentkitHeader,
      resourceUri: world.resourceUri,
    });
    const graphSignal = await requireAgentRegistration({
      signals: options.agentRegistrationSignals,
      requiredCapability: options.requiredAgentCapability,
      agentAddress: authorization.agentAddress,
    });
    const result = await requireMarketplace(options.marketplace, request).requestReservation({
      requestId: idempotencyKey,
      quoteId: input.quoteId,
      authorization,
    });

    if (result.status === 'conflict') {
      return reply
        .code(409)
        .send(errorEnvelope(request, 'dates_unavailable', 'Requested dates are already held'));
    }

    return reply.code(result.status === 'created' ? 201 : 200).send({
      status: result.status,
      hold: holdDto(result.hold),
      bookingRequest: result.bookingRequest,
      booking: bookingDto(result.booking),
      approval: result.approval,
      authorization: {
        provider: 'world_agentkit',
        humanBacked: true,
      },
      onchainSignal: graphSignalDto(graphSignal, options.requiredAgentCapability ?? 'unconfigured'),
    });
  });

  app.post('/v1/booking-requests/:requestId/decision', async (request) => {
    const { requestId } = bookingRequestParams.parse(request.params);
    const input = decisionBody.parse(request.body);
    const result = await requireMarketplace(options.marketplace, request).decideBookingRequest({
      requestId,
      hostProfileId: input.hostProfileId,
      decision: input.decision,
    });

    return {
      bookingRequest: result.bookingRequest,
      booking: bookingDto(result.booking),
      hold: holdDto(result.hold),
    };
  });

  app.get('/v1/bookings/:bookingId', async (request) => {
    const { bookingId } = bookingParams.parse(request.params);
    const booking = await requireMarketplace(options.marketplace, request).getBooking(bookingId);
    return bookingDto(booking);
  });

  app.post('/v1/bookings/:bookingId/deposit', async (request, reply) => {
    const { bookingId } = bookingParams.parse(request.params);
    const idempotencyKey = z.string().min(8).max(200).parse(request.headers['idempotency-key']);
    const result = await requireDeposits(options.deposits, request).fundDeposit({
      bookingId,
      idempotencyKey,
    });

    return reply
      .code(result.snapshot.operation.status === 'confirmed' ? 200 : 202)
      .send(depositDto(result, options.hederaTopicId));
  });

  app.get('/v1/operations/:operationId', async (request) => {
    const { operationId } = operationParams.parse(request.params);
    const result = await requireDeposits(options.deposits, request).getDeposit(operationId);
    return depositDto(result, options.hederaTopicId);
  });

  app.post('/v1/operations/:operationId/reconcile', async (request, reply) => {
    const { operationId } = operationParams.parse(request.params);
    const result = await requireDeposits(options.deposits, request).reconcileDeposit(operationId);

    return reply
      .code(result.snapshot.operation.status === 'confirmed' ? 200 : 202)
      .send(depositDto(result, options.hederaTopicId));
  });

  app.setNotFoundHandler((request, reply) =>
    reply
      .code(404)
      .send(errorEnvelope(request, 'route_not_found', 'The requested API route does not exist')),
  );

  app.setErrorHandler(
    (error: Error & { code?: string }, request: FastifyRequest, reply: FastifyReply) => {
      if (error instanceof ZodError) {
        return reply.code(400).send(
          errorEnvelope(request, 'validation_error', 'Request validation failed', {
            issues: error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
          }),
        );
      }

      if (error instanceof ResourceNotFoundError) {
        return reply.code(404).send(errorEnvelope(request, 'resource_not_found', error.message));
      }

      if (error instanceof HumanBackedAuthorizationError) {
        return reply.code(403).send(errorEnvelope(request, error.reason, error.message));
      }

      if (error instanceof WorldIdVerificationError) {
        const statusCode = error.reason === 'world_id_provider_unavailable' ? 503 : 400;
        return reply.status(statusCode).send(errorEnvelope(request, error.reason, error.message));
      }

      if (error instanceof AgentRegistrationError) {
        return reply.code(403).send(errorEnvelope(request, error.reason, error.message));
      }

      if (error instanceof OnchainSignalProviderError) {
        return reply.code(503).send(errorEnvelope(request, error.reason, error.message));
      }

      if (error instanceof InvalidWalletControlProofError) {
        return reply
          .code(401)
          .send(errorEnvelope(request, 'wallet_control_proof_invalid', error.message));
      }

      if (error instanceof PoapHistoryProviderError) {
        return reply
          .code(503)
          .send(errorEnvelope(request, 'poap_provider_unavailable', error.message));
      }

      if (error instanceof DomainConflictError || error instanceof InvalidStateTransitionError) {
        const code =
          error instanceof DomainConflictError ? error.conflict : 'invalid_state_transition';
        return reply.code(409).send(errorEnvelope(request, code, error.message));
      }

      if (error instanceof DomainValidationError || error.code === '22023') {
        return reply
          .code(400)
          .send(errorEnvelope(request, 'domain_validation_error', error.message));
      }

      if (error.code === '23505') {
        return reply
          .code(409)
          .send(errorEnvelope(request, 'unique_constraint_conflict', 'Resource already exists'));
      }

      request.log.error({ error, requestId: request.id }, 'Unhandled API error');
      return reply
        .code(500)
        .send(errorEnvelope(request, 'internal_error', 'Unexpected server error'));
    },
  );

  return app;
}
