const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3100').replace(/\/$/, '');

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
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

export interface SearchInput {
  city: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  maximumNightlyRateAtomic?: string;
  amenities: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let body: ApiErrorEnvelope | undefined;

    try {
      body = (await response.json()) as ApiErrorEnvelope;
    } catch {
      throw new NookApiError(
        'network_response_error',
        `The Nook API returned ${response.status}`,
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

export const nookApi = {
  readiness: () => request<{ service: string; status: 'ready' }>('/ready'),

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

  createQuote: (input: {
    listingId: string;
    guestProfileId: string;
    checkIn: string;
    checkOut: string;
  }) =>
    request<BookingQuote>('/v1/booking-quotes', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  requestReservation: (input: { quoteId: string; idempotencyKey: string }) =>
    request<ReservationResult>('/v1/reservation-holds', {
      method: 'POST',
      headers: {
        'idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify({ quoteId: input.quoteId }),
    }),

  decideBookingRequest: (input: {
    requestId: string;
    hostProfileId: string;
    decision: 'approved' | 'rejected';
  }) =>
    request<{
      bookingRequest: ReservationResult['bookingRequest'];
      booking: Booking;
      hold: ReservationResult['hold'];
    }>(`/v1/booking-requests/${input.requestId}/decision`, {
      method: 'POST',
      body: JSON.stringify({
        hostProfileId: input.hostProfileId,
        decision: input.decision,
      }),
    }),

  createListing: (input: {
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
