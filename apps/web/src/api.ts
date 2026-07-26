const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3100').replace(/\/$/, '');
let memberSessionToken: string | null = null;

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

interface AgentkitChallengeEnvelope {
  error: 'human_backed_authorization_required';
  extensions: Record<string, unknown>;
}

export class NookApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId?: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'NookApiError';
  }
}

export interface Listing {
  id: string;
  hostProfileId: string;
  title: string;
  description: string;
  city: string;
  neighborhood: string;
  approximateLocationRef: string;
  amenities: string[];
  houseRules: string[];
  settlementTokenId: string;
  nightlyRateAtomic: string;
  baseDepositAtomic: string;
  maxGuests: number;
  status: 'archived' | 'draft' | 'paused' | 'published';
  createdAt: string;
  updatedAt: string;
}

export interface ListingDetail {
  listing: Listing;
  availability: Array<{
    id: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    createdAt: string;
  }>;
  approvalPolicy: {
    listingId: string;
    policy: {
      automaticApprovalEnabled: boolean;
      minimumRentalReputationTier: 'bronze' | 'gold' | 'newcomer' | 'silver';
    };
    version: number;
    updatedAt: string;
  };
}

export interface BookingQuote {
  id: string;
  listingId: string;
  guestProfileId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  settlementTokenId: string;
  nightlyRateAtomic: string;
  staySubtotalAtomic: string;
  baseDepositAtomic: string;
  quotedDepositAtomic: string;
  totalDueAtomic: string;
  reputationTier: 'bronze' | 'gold' | 'newcomer' | 'silver';
  expiresAt: string;
  createdAt: string;
}

export interface Booking {
  id: string;
  listingId: string;
  hostProfileId: string;
  guestProfileId: string;
  quoteId: string;
  holdId: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  settlementTokenId: string;
  staySubtotalAtomic: string;
  depositAmountAtomic: string;
  status:
    | 'approval_pending'
    | 'awaiting_deposit'
    | 'cancelled'
    | 'checked_in'
    | 'checkout_pending'
    | 'completed'
    | 'confirmed'
    | 'disputed'
    | 'expired'
    | 'rejected'
    | 'request_received';
  createdAt: string;
  updatedAt: string;
}

export interface ReservationResult {
  status: 'created' | 'idempotent';
  hold: {
    id: string;
    listingId: string;
    guestProfileId: string;
    quoteId: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    status: 'active' | 'converted' | 'expired' | 'released';
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
  };
  bookingRequest: {
    id: string;
    holdId: string;
    listingId: string;
    guestProfileId: string;
    approvalResult: 'approved' | 'auto_approved' | 'host_review' | 'rejected';
    approvalReason?: string;
    policyVersion: number;
    status: 'approved' | 'cancelled' | 'expired' | 'pending' | 'rejected';
    createdAt: string;
    updatedAt: string;
  };
  booking: Booking;
  approval: {
    status: 'auto_approved' | 'host_review';
    reason?: 'automatic_approval_disabled' | 'rental_reputation_below_minimum';
  };
  authorization?: {
    provider: 'world_agentkit';
    humanBacked: true;
  };
  onchainSignal?: {
    provider: 'the_graph';
    subgraph: 'agent0';
    network: string;
    chainId: number;
    subgraphId: string;
    sourceRef: string;
    registered: true;
    active: true;
    binding: 'agent_wallet' | 'operator' | 'owner';
    requiredCapability: string;
    capabilityPresent: true;
  };
}

export interface WorldConnection {
  provider: 'world_agentkit';
  humanBacked: true;
  network: 'world_chain';
  onchainSignal: NonNullable<ReservationResult['onchainSignal']>;
}

export interface MemberSession {
  id: string;
  profileId?: string;
  humanVerified: boolean;
  expiresAt: string;
}

export interface CreatedMemberSession {
  token: string;
  session: MemberSession;
}

export interface WorldIdMemberConfig {
  appId: `app_${string}`;
  rpId: `rp_${string}`;
  action: string;
  environment: 'production' | 'staging' | 'sandbox';
}

export interface WorldIdRpContext {
  rp_id: string;
  nonce: string;
  created_at: number;
  expires_at: number;
  signature: string;
}

export interface WorldIdMemberVerification {
  provider: 'world_id';
  credential: 'proof_of_human';
  humanVerified: true;
  environment: 'production' | 'staging' | 'sandbox';
  status: 'created' | 'existing' | 'idempotent';
  profileId?: string;
}

export type WorldIdMemberStatus =
  | WorldIdMemberVerification
  | {
      humanVerified: false;
    };

export interface WalletChallenge {
  address: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  message: string;
  integrity: string;
}

export interface WalletEvidence {
  provider: 'poap_compass';
  walletControl: {
    verified: true;
    address: string;
    verifiedAt: string;
  };
  signals: {
    totalPoaps: number;
    distinctEvents: number;
    activeYears: number[];
    firstCollectedAt?: string;
    latestCollectedAt?: string;
    tokensWithRecordedTransfers: number;
    totalRecordedTransfers: number;
  };
  recentPoaps: Array<{
    tokenId: string;
    eventId: string;
    collectedAt: string;
    transferCount: number;
    chain?: string;
    eventName?: string;
    eventStartDate?: string;
    imageUrl?: string;
  }>;
  truncated: boolean;
  theGraph?: {
    provider: 'the_graph';
    dataset: 'ens';
    network: 'ethereum';
    subgraphId: string;
    sourceRef: string;
    ownedNames: string[];
    truncated: boolean;
  };
}

export interface DepositResult {
  idempotent: boolean;
  operation: {
    id: string;
    status: 'pending' | 'reserved' | 'submitted' | 'confirmed' | 'failed' | 'reconciling';
    transactionId?: string;
    transactionUrl?: string;
    failureCode?: string;
    attemptCount: number;
    nextAttemptAt?: string;
    createdAt: string;
    updatedAt: string;
  };
  escrow: {
    id: string;
    tokenId: string;
    amountAtomic: string;
    status:
      'pending' | 'submitted' | 'funded' | 'release_pending' | 'released' | 'refunded' | 'failed';
    fundedTransactionId?: string;
  };
  payment: {
    id: string;
    tokenId: string;
    amountAtomic: string;
    status: 'pending' | 'submitted' | 'confirmed' | 'failed';
  };
  booking: Booking;
  hold: ReservationResult['hold'];
  evidence:
    | {
        status: 'not_started';
        topicId?: string;
        topicUrl?: string;
      }
    | {
        status: 'pending';
        transactionId: string;
        transactionUrl?: string;
        topicId?: string;
        topicUrl?: string;
      }
    | {
        status: 'confirmed';
        transactionId: string;
        transactionUrl?: string;
        sequenceNumber: number;
        topicId?: string;
        topicUrl?: string;
      };
}

export interface AgentPaymentMandate {
  id: string;
  bookingId: string;
  tokenId: string;
  maximumDepositAtomic: string;
  status: 'active' | 'consumed' | 'expired' | 'cancelled';
  expiresAt: string;
  operationId?: string;
  consumedAt?: string;
}

export interface SearchInput {
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  maximumNightlyRateAtomic?: string;
  amenities: string;
}

export interface AgentExecution {
  provider: 'deterministic' | 'openai';
  mode: 'fallback' | 'live';
  model?: string;
  fallbackReason?: 'invalid_output' | 'provider_error' | 'provider_unavailable';
}

export interface HostAgentDraftResult {
  draft: {
    title: string;
    description: string;
    suggestedAmenities: string[];
    inferredFields: Array<'description' | 'suggestedAmenities' | 'title'>;
  };
  agent: AgentExecution;
  requiresHostConfirmation: true;
}

export type GuestAgentSearchResult =
  | {
      status: 'needs_clarification';
      question: string;
      agent: {
        interpretation: AgentExecution;
      };
    }
  | {
      status: 'ready';
      interpretation: {
        status: 'ready';
        city: string;
        checkIn: string;
        checkOut: string;
        guests: number;
        maximumNightlyRateAtomic?: string;
        requiredAmenities: string[];
      };
      totalMatches: number;
      items: Array<{
        listing: Listing;
        summary: string;
        matchReasons: string[];
      }>;
      agent: {
        interpretation: AgentExecution;
        ranking?: AgentExecution;
      };
    };

export type AgentSecureMatchResult =
  | {
      status: 'needs_clarification';
      question: string;
      agent: {
        interpretation: AgentExecution;
      };
    }
  | {
      status: 'no_match';
      mandate: Extract<GuestAgentSearchResult, { status: 'ready' }>['interpretation'];
      totalMatches: number;
      agent: Extract<GuestAgentSearchResult, { status: 'ready' }>['agent'];
    }
  | {
      status: 'secured';
      mandate: Extract<GuestAgentSearchResult, { status: 'ready' }>['interpretation'];
      selectedMatch: {
        listing: Listing;
        summary: string;
        matchReasons: string[];
      };
      quote: BookingQuote;
      reservation: ReservationResult;
      paymentMandate: AgentPaymentMandate;
      deposit?: DepositResult;
      agent: Extract<GuestAgentSearchResult, { status: 'ready' }>['agent'];
    };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(memberSessionToken ? { authorization: `Bearer ${memberSessionToken}` } : {}),
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: ApiErrorEnvelope | AgentkitChallengeEnvelope | undefined;

    try {
      body = (await response.json()) as ApiErrorEnvelope | AgentkitChallengeEnvelope;
    } catch {
      throw new NookApiError(
        'network_response_error',
        `The Nook API returned ${response.status}`,
        undefined,
        response.status,
      );
    }

    if (typeof body.error === 'string') {
      throw new NookApiError(
        'human_backed_authorization_required',
        'World AgentKit verification is required for this protected action',
        undefined,
        response.status,
      );
    }

    throw new NookApiError(
      body.error.code,
      body.error.message,
      body.error.requestId,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function setMemberSessionToken(token: string | null): void {
  memberSessionToken = token;
}

export const nookApi = {
  readiness: () => request<{ service: string; status: 'ready' }>('/ready'),

  createMemberSession: () =>
    request<CreatedMemberSession>('/v1/member-sessions', {
      method: 'POST',
    }),

  currentMemberSession: () => request<MemberSession>('/v1/member-session'),

  createWalletChallenge: (address: string) =>
    request<WalletChallenge>('/v1/wallet-verification/challenge', {
      method: 'POST',
      body: JSON.stringify({ address }),
    }),

  readWalletEvidence: (input: { challenge: WalletChallenge; signature: string }) =>
    request<WalletEvidence>('/v1/wallet-verification/evidence', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  connectWorldAgent: () =>
    request<WorldConnection>('/v1/agents/guest/world-connection', {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  memberWorldIdConfig: () => request<WorldIdMemberConfig>('/v1/world-id/member/config'),

  memberWorldIdStatus: () => request<WorldIdMemberStatus>('/v1/world-id/member/status'),

  createMemberWorldIdRpContext: () =>
    request<WorldIdRpContext>('/v1/world-id/member/rp-signature', {
      method: 'POST',
    }),

  verifyMemberWorldId: (proof: unknown) =>
    request<WorldIdMemberVerification>('/v1/world-id/member/verify', {
      method: 'POST',
      body: JSON.stringify({ proof }),
    }),

  createHostAgentDraft: (input: {
    hostFacts: {
      city: string;
      neighborhood: string;
      propertyType: string;
      maxGuests: number;
      confirmedAmenities: string[];
      houseRules: string[];
      highlights: string[];
    };
    imageRefs: string[];
  }) =>
    request<HostAgentDraftResult>('/v1/listings/drafts', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  searchWithGuestAgent: (query: string) =>
    request<GuestAgentSearchResult>('/v1/agents/guest/search', {
      method: 'POST',
      body: JSON.stringify({ query }),
    }),

  secureBestMatch: (input: {
    query: string;
    idempotencyKey: string;
    maximumDepositAtomic: string;
  }) =>
    request<AgentSecureMatchResult>('/v1/agents/guest/secure-match', {
      method: 'POST',
      headers: {
        'idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify({
        query: input.query,
        paymentMandate: {
          authorized: true,
          maximumDepositAtomic: input.maximumDepositAtomic,
        },
      }),
    }),

  searchListings: (input: SearchInput) => {
    const query = new URLSearchParams({
      city: input.city,
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: input.guests.toString(),
    });

    if (input.maximumNightlyRateAtomic) {
      query.set('maximumNightlyRateAtomic', input.maximumNightlyRateAtomic);
    }
    if (input.amenities.trim()) {
      query.set('amenities', input.amenities);
    }

    return request<{ items: Listing[] }>(`/v1/listings?${query.toString()}`);
  },

  createQuote: (input: { listingId: string; checkIn: string; checkOut: string }) =>
    request<BookingQuote>('/v1/booking-quotes', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  requestReservation: (input: { quoteId: string; idempotencyKey: string }) =>
    request<ReservationResult>('/v1/agents/guest/reservation-holds', {
      method: 'POST',
      headers: {
        'idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify({ quoteId: input.quoteId }),
    }),

  decideBookingRequest: (input: { requestId: string; decision: 'approved' | 'rejected' }) =>
    request<{
      bookingRequest: ReservationResult['bookingRequest'];
      booking: Booking;
      hold: ReservationResult['hold'];
      paymentMandate?: AgentPaymentMandate;
      deposit?: DepositResult;
    }>(`/v1/booking-requests/${input.requestId}/decision`, {
      method: 'POST',
      body: JSON.stringify({
        decision: input.decision,
      }),
    }),

  createListing: (input: {
    title: string;
    description: string;
    city: string;
    neighborhood: string;
    approximateLocationRef: string;
    amenities: string[];
    houseRules: string[];
    settlementTokenId: string;
    nightlyRateAtomic: string;
    baseDepositAtomic: string;
    maxGuests: number;
    availability: Array<{ checkIn: string; checkOut: string }>;
    approvalPolicy: {
      automaticApprovalEnabled: boolean;
      minimumRentalReputationTier: 'bronze' | 'gold' | 'newcomer' | 'silver';
    };
  }) =>
    request<ListingDetail>('/v1/listings', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  publishListing: (listingId: string) =>
    request<ListingDetail>(`/v1/listings/${listingId}/publish`, {
      method: 'POST',
    }),

  fundDeposit: (input: { bookingId: string; idempotencyKey: string }) =>
    request<DepositResult>(`/v1/bookings/${input.bookingId}/deposit`, {
      method: 'POST',
      headers: {
        'idempotency-key': input.idempotencyKey,
      },
    }),

  reconcileDeposit: (operationId: string) =>
    request<DepositResult>(`/v1/operations/${operationId}/reconcile`, {
      method: 'POST',
    }),
};
