import { randomUUID } from 'node:crypto';

import {
  BookingDepositService,
  type FinancialLedgerPort,
  MarketplaceService,
  type RentalEvidencePort,
} from '@nook-rent/core';
import {
  applyMigrations,
  createPostgresClient,
  PostgresAvailabilityWindowRepository,
  PostgresBookingQuoteRepository,
  PostgresBookingRepository,
  PostgresBookingRequestRepository,
  PostgresDepositOperationRepository,
  PostgresListingApprovalPolicyRepository,
  PostgresListingRepository,
  PostgresMemberProfileRepository,
  type PostgresClient,
  PostgresRentalReputationRepository,
  PostgresReservationHoldRepository,
} from '@nook-rent/supabase';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const NOW = '2026-07-25T10:00:00.000Z';

describeWithDatabase('marketplace API tracer', () => {
  let sql: PostgresClient;
  let application: ReturnType<typeof createApi>;
  let ledger: FakeLedger;

  beforeAll(async () => {
    sql = createPostgresClient(databaseUrl ?? '', { maxConnections: 5 });
    await applyMigrations(sql);
    const bookings = new PostgresBookingRepository(sql);
    const marketplace = new MarketplaceService({
      profiles: new PostgresMemberProfileRepository(sql),
      listings: new PostgresListingRepository(sql),
      availability: new PostgresAvailabilityWindowRepository(sql),
      approvalPolicies: new PostgresListingApprovalPolicyRepository(sql),
      quotes: new PostgresBookingQuoteRepository(sql),
      holds: new PostgresReservationHoldRepository(sql),
      bookingRequests: new PostgresBookingRequestRepository(sql),
      bookings,
      reputation: new PostgresRentalReputationRepository(sql),
      clock: { now: () => NOW },
      ids: { next: () => randomUUID() },
    });
    ledger = new FakeLedger();
    const deposits = new BookingDepositService({
      bookings,
      operations: new PostgresDepositOperationRepository(sql),
      ledger,
      evidence: new FakeEvidence(),
      clock: { now: () => NOW },
      ids: { next: () => randomUUID() },
      escrowRecipientRef: '0.0.2002',
    });
    application = createApi({
      marketplace,
      deposits,
      hederaTopicId: '0.0.8001',
      readiness: async () => {
        await sql`select 1`;
      },
    });
  });

  beforeEach(async () => {
    await sql`
      truncate table
        nook.reputation_projections,
        nook.rental_events,
        nook.payments,
        nook.escrows,
        nook.operations,
        nook.bookings,
        nook.booking_requests,
        nook.reservation_holds,
        nook.booking_quotes,
        nook.availability_windows,
        nook.listing_approval_policies,
        nook.listings,
        nook.agent_bindings,
        nook.profiles
      cascade
    `;
  });

  afterAll(async () => {
    await application.close();
    await sql.end();
  });

  it('completes Listing, search, quote, automatic approval, and idempotent retry', async () => {
    const host = await createProfile('host', 'host-maria');
    const guest = await createProfile('guest', 'guest-experienced');
    await setReputation(guest.id, 'silver', 3);
    const listing = await createAndPublishListing(host.id);

    const searchResponse = await application.inject({
      method: 'GET',
      url: `/v1/listings?city=lisbon&checkIn=2026-08-10&checkOut=2026-08-15&guests=2&amenities=wifi`,
    });
    expect(searchResponse.statusCode).toBe(200);
    expect(searchResponse.json().items).toHaveLength(1);
    expect(searchResponse.json().items[0].id).toBe(listing.id);

    const quoteResponse = await application.inject({
      method: 'POST',
      url: '/v1/booking-quotes',
      payload: {
        listingId: listing.id,
        guestProfileId: guest.id,
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
      },
    });
    expect(quoteResponse.statusCode).toBe(201);
    expect(quoteResponse.json()).toMatchObject({
      nights: 5,
      nightlyRateAtomic: '10000',
      staySubtotalAtomic: '50000',
      quotedDepositAtomic: '50000',
      totalDueAtomic: '100000',
      reputationTier: 'silver',
    });

    const requestPayload = {
      method: 'POST' as const,
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'api-auto-approval-request',
      },
      payload: {
        quoteId: quoteResponse.json().id,
      },
    };
    const holdResponse = await application.inject(requestPayload);
    const retryResponse = await application.inject(requestPayload);

    expect(holdResponse.statusCode).toBe(201);
    expect(holdResponse.json()).toMatchObject({
      status: 'created',
      approval: { status: 'auto_approved' },
      bookingRequest: { status: 'approved' },
      booking: { status: 'awaiting_deposit' },
    });
    expect(retryResponse.statusCode).toBe(200);
    expect(retryResponse.json()).toMatchObject({
      status: 'idempotent',
      booking: {
        id: holdResponse.json().booking.id,
      },
    });

    const depositRequest = {
      method: 'POST' as const,
      url: `/v1/bookings/${holdResponse.json().booking.id}/deposit`,
      headers: {
        'idempotency-key': 'api-hedera-deposit-request',
      },
    };
    const depositResponse = await application.inject(depositRequest);
    const depositRetry = await application.inject(depositRequest);

    expect(depositResponse.statusCode).toBe(200);
    expect(depositResponse.json()).toMatchObject({
      operation: {
        status: 'confirmed',
        transactionId: '0.0.1001@1784980800.000000001',
      },
      escrow: {
        status: 'funded',
      },
      payment: {
        status: 'confirmed',
      },
      booking: {
        status: 'confirmed',
      },
      hold: {
        status: 'converted',
      },
      evidence: {
        status: 'confirmed',
        sequenceNumber: 14,
        topicId: '0.0.8001',
      },
    });
    expect(depositRetry.statusCode).toBe(200);
    expect(depositRetry.json().idempotent).toBe(true);
    expect(ledger.submissionCount).toBe(1);

    const conflictingGuest = await createProfile('guest', 'guest-conflicting');
    const conflictingQuote = await application.inject({
      method: 'POST',
      url: '/v1/booking-quotes',
      payload: {
        listingId: listing.id,
        guestProfileId: conflictingGuest.id,
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
      },
    });
    const conflictResponse = await application.inject({
      method: 'POST',
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'api-conflicting-request',
      },
      payload: {
        quoteId: conflictingQuote.json().id,
      },
    });
    expect(conflictResponse.statusCode).toBe(409);
    expect(conflictResponse.json()).toMatchObject({
      error: {
        code: 'dates_unavailable',
      },
    });
  });

  it('routes a Newcomer to Host review and applies the Host decision', async () => {
    const host = await createProfile('host', 'host-joao');
    const guest = await createProfile('guest', 'guest-newcomer');
    const listing = await createAndPublishListing(host.id);
    const quoteResponse = await application.inject({
      method: 'POST',
      url: '/v1/booking-quotes',
      payload: {
        listingId: listing.id,
        guestProfileId: guest.id,
        checkIn: '2026-08-20',
        checkOut: '2026-08-25',
      },
    });
    const holdResponse = await application.inject({
      method: 'POST',
      url: '/v1/reservation-holds',
      headers: {
        'idempotency-key': 'api-host-review-request',
      },
      payload: {
        quoteId: quoteResponse.json().id,
      },
    });

    expect(holdResponse.statusCode).toBe(201);
    expect(holdResponse.json()).toMatchObject({
      approval: {
        status: 'host_review',
        reason: 'rental_reputation_below_minimum',
      },
      bookingRequest: { status: 'pending' },
      booking: { status: 'approval_pending' },
    });

    const decisionResponse = await application.inject({
      method: 'POST',
      url: `/v1/booking-requests/${holdResponse.json().bookingRequest.id}/decision`,
      payload: {
        hostProfileId: host.id,
        decision: 'approved',
      },
    });
    expect(decisionResponse.statusCode).toBe(200);
    expect(decisionResponse.json()).toMatchObject({
      bookingRequest: { status: 'approved', approvalResult: 'approved' },
      booking: { status: 'awaiting_deposit' },
      hold: { status: 'active' },
    });

    const bookingResponse = await application.inject({
      method: 'GET',
      url: `/v1/bookings/${decisionResponse.json().booking.id}`,
    });
    expect(bookingResponse.statusCode).toBe(200);
    expect(bookingResponse.json()).toMatchObject({
      status: 'awaiting_deposit',
      depositAmountAtomic: '75000',
    });
  });

  async function createProfile(role: 'guest' | 'host', publicRef: string): Promise<{ id: string }> {
    const response = await application.inject({
      method: 'POST',
      url: '/v1/profiles',
      payload: { role, publicRef },
    });

    expect(response.statusCode).toBe(201);
    return response.json<{ id: string }>();
  }

  async function createAndPublishListing(hostProfileId: string): Promise<{ id: string }> {
    const createResponse = await application.inject({
      method: 'POST',
      url: '/v1/listings',
      payload: {
        hostProfileId,
        title: 'Alfama work-friendly nook',
        description: 'A temporary Lisbon stay with a desk.',
        city: 'Lisbon',
        neighborhood: 'Alfama',
        approximateLocationRef: 'lisbon-alfama-demo-area',
        amenities: ['wifi', 'desk'],
        houseRules: ['No smoking'],
        settlementTokenId: '0.0.12345',
        nightlyRateAtomic: '10000',
        baseDepositAtomic: '50000',
        maxGuests: 2,
        availability: [
          {
            checkIn: '2026-08-01',
            checkOut: '2026-09-01',
          },
        ],
        approvalPolicy: {
          automaticApprovalEnabled: true,
          minimumRentalReputationTier: 'silver',
        },
      },
    });
    expect(createResponse.statusCode).toBe(201);

    const listingId = createResponse.json<{ listing: { id: string } }>().listing.id;
    const publishResponse = await application.inject({
      method: 'POST',
      url: `/v1/listings/${listingId}/publish`,
    });
    expect(publishResponse.statusCode).toBe(200);
    return publishResponse.json<{ listing: { id: string } }>().listing;
  }

  async function setReputation(
    profileId: string,
    tier: 'bronze' | 'gold' | 'silver',
    completedStays: number,
  ): Promise<void> {
    await sql`
      insert into nook.reputation_projections (
        profile_id,
        ruleset_version,
        total_units,
        tier,
        completed_stays,
        event_count
      )
      values (
        ${profileId},
        1,
        ${completedStays},
        ${tier},
        ${completedStays},
        ${completedStays}
      )
    `;
  }
});

class FakeLedger implements FinancialLedgerPort {
  submissionCount = 0;

  reserveTransactionId(): Promise<string> {
    return Promise.resolve('0.0.1001@1784980800.000000001');
  }

  submitDeposit(): Promise<{ transactionId: string }> {
    this.submissionCount += 1;
    return Promise.resolve({ transactionId: '0.0.1001@1784980800.000000001' });
  }

  getTransactionStatus(): Promise<'confirmed'> {
    return Promise.resolve('confirmed');
  }
}

class FakeEvidence implements RentalEvidencePort {
  reserveTransactionId(): Promise<string> {
    return Promise.resolve('0.0.1001@1784980801.000000001');
  }

  publish(): Promise<{ transactionId: string; sequenceNumber: number }> {
    return Promise.resolve({
      transactionId: '0.0.1001@1784980801.000000001',
      sequenceNumber: 14,
    });
  }
}
