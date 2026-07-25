import cors from '@fastify/cors';
import {
  DomainConflictError,
  DomainValidationError,
  InvalidStateTransitionError,
  type Booking,
  type BookingDepositService,
  type BookingQuote,
  type DepositWorkflowResult,
  type Listing,
  type ListingDetail,
  type MarketplaceService,
  type ReservationHold,
  ResourceNotFoundError,
  StayRange,
  TokenAmount,
} from '@nook-rent/core';
import { hederaTopicUrl, hederaTransactionUrl } from '@nook-rent/hedera';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z, ZodError } from 'zod';

export interface CreateApiOptions {
  logger?: boolean;
  allowedOrigins?: string[];
  marketplace?: MarketplaceService;
  deposits?: Pick<BookingDepositService, 'fundDeposit' | 'getDeposit' | 'reconcileDeposit'>;
  hederaTopicId?: string;
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

const decisionBody = z.object({
  hostProfileId: uuid,
  decision: z.enum(['approved', 'rejected']),
});

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
  marketplace: MarketplaceService | undefined,
  request: FastifyRequest,
): MarketplaceService {
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
  const app = Fastify({
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

  app.post('/v1/listings', async (request, reply) => {
    const input = listingBody.parse(request.body);
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

  app.post('/v1/reservation-holds', async (request, reply) => {
    const input = holdBody.parse(request.body);
    const idempotencyKey = z.string().min(8).max(200).parse(request.headers['idempotency-key']);
    const result = await requireMarketplace(options.marketplace, request).requestReservation({
      requestId: idempotencyKey,
      quoteId: input.quoteId,
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
