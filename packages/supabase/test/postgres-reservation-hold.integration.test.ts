import { StayRange, TokenAmount } from '@nook-rent/core';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createPostgresClient, type PostgresClient } from '../src/client.js';
import { applyMigrations } from '../src/migrations.js';
import {
  PostgresBookingRepository,
  PostgresDepositOperationRepository,
  PostgresListingRepository,
  PostgresReservationHoldRepository,
} from '../src/repositories.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithDatabase = databaseUrl ? describe : describe.skip;

const HOST_ID = '10000000-0000-4000-8000-000000000001';
const GUEST_ONE_ID = '20000000-0000-4000-8000-000000000001';
const GUEST_TWO_ID = '20000000-0000-4000-8000-000000000002';
const LISTING_ID = '30000000-0000-4000-8000-000000000001';
const QUOTE_ONE_ID = '40000000-0000-4000-8000-000000000001';
const QUOTE_TWO_ID = '40000000-0000-4000-8000-000000000002';
const NOW = '2026-07-25T10:00:00.000Z';

function authorization(nonce: string, human = '1') {
  return {
    provider: 'world_agentkit' as const,
    agentAddress: `0x${human.repeat(40)}`,
    anonymousHumanRefHash: human.repeat(64),
    nonce,
  };
}

describeWithDatabase('Postgres Reservation Hold repository', () => {
  let sql: PostgresClient;
  let bookingRepository: PostgresBookingRepository;
  let depositRepository: PostgresDepositOperationRepository;
  let listingRepository: PostgresListingRepository;
  let repository: PostgresReservationHoldRepository;

  beforeAll(async () => {
    sql = createPostgresClient(databaseUrl ?? '', { maxConnections: 5 });
    await applyMigrations(sql);
    bookingRepository = new PostgresBookingRepository(sql);
    depositRepository = new PostgresDepositOperationRepository(sql);
    listingRepository = new PostgresListingRepository(sql);
    repository = new PostgresReservationHoldRepository(sql);
  });

  beforeEach(async () => {
    await sql`
      truncate table
        nook.human_backed_authorizations,
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

    await seedMarketplace(sql);
  });

  afterAll(async () => {
    await sql.end();
  });

  it('allows only one of two concurrent overlapping holds', async () => {
    const stayRange = StayRange.fromStrings({
      checkIn: '2026-08-10',
      checkOut: '2026-08-15',
    });

    const results = await Promise.all([
      repository.createActive({
        requestId: 'request-concurrent-one',
        listingId: LISTING_ID,
        guestProfileId: GUEST_ONE_ID,
        quoteId: QUOTE_ONE_ID,
        stayRange,
        expiresAt: '2026-07-25T10:10:00.000Z',
        now: NOW,
        authorization: authorization('world-concurrent-one', '1'),
      }),
      repository.createActive({
        requestId: 'request-concurrent-two',
        listingId: LISTING_ID,
        guestProfileId: GUEST_TWO_ID,
        quoteId: QUOTE_TWO_ID,
        stayRange,
        expiresAt: '2026-07-25T10:10:00.000Z',
        now: NOW,
        authorization: authorization('world-concurrent-two', '2'),
      }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(['conflict', 'created']);
  });

  it('searches only Listings whose stored availability and hard filters match', async () => {
    const matches = await listingRepository.search({
      city: 'lisbon',
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
      }),
      maximumNightlyRate: TokenAmount.fromAtomicUnits('10000'),
      guests: 2,
      requiredAmenities: ['wifi'],
    });
    const misses = await listingRepository.search({
      city: 'Lisbon',
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
      }),
      guests: 2,
      requiredAmenities: ['lift'],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe(LISTING_ID);
    expect(matches[0]?.nightlyRate.toString()).toBe('10000');
    expect(misses).toEqual([]);
  });

  it('returns the original hold when the same request is retried', async () => {
    const input = {
      requestId: 'request-idempotent',
      listingId: LISTING_ID,
      guestProfileId: GUEST_ONE_ID,
      quoteId: QUOTE_ONE_ID,
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
      }),
      expiresAt: '2026-07-25T10:10:00.000Z',
      now: NOW,
      authorization: authorization('world-idempotent'),
    };

    const first = await repository.createActive(input);
    const retry = await repository.createActive(input);

    expect(first.status).toBe('created');
    expect(retry.status).toBe('idempotent');

    if (first.status === 'created' && retry.status === 'idempotent') {
      expect(retry.hold.id).toBe(first.hold.id);
    }
  });

  it('accepts and consumes a fresh World nonce on an idempotent retry', async () => {
    const input = {
      requestId: 'request-idempotent-fresh-world-nonce',
      listingId: LISTING_ID,
      guestProfileId: GUEST_ONE_ID,
      quoteId: QUOTE_ONE_ID,
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
      }),
      expiresAt: '2026-07-25T10:10:00.000Z',
      now: NOW,
      authorization: authorization('world-idempotent-original'),
    };

    const first = await repository.createActive(input);
    const retry = await repository.createActive({
      ...input,
      authorization: authorization('world-idempotent-fresh'),
    });

    expect(first.status).toBe('created');
    expect(retry.status).toBe('idempotent');

    if (first.status === 'created' && retry.status === 'idempotent') {
      expect(retry.hold.id).toBe(first.hold.id);
    }

    const [authorizationRow] = await sql<{ authorizationCount: string }[]>`
      select count(*)::text as "authorizationCount"
      from nook.human_backed_authorizations
      where request_id = ${input.requestId}
    `;
    expect(authorizationRow?.authorizationCount).toBe('2');

    await expect(
      repository.createActive({
        ...input,
        requestId: 'request-replaying-idempotent-nonce',
        guestProfileId: GUEST_TWO_ID,
        quoteId: QUOTE_TWO_ID,
        authorization: authorization('world-idempotent-fresh', '2'),
      }),
    ).rejects.toMatchObject({
      conflict: 'world_nonce_replayed',
    });
  });

  it('rejects a replayed World AgentKit nonce', async () => {
    const stayRange = StayRange.fromStrings({
      checkIn: '2026-08-10',
      checkOut: '2026-08-15',
    });

    await repository.createActive({
      requestId: 'request-world-nonce-first',
      listingId: LISTING_ID,
      guestProfileId: GUEST_ONE_ID,
      quoteId: QUOTE_ONE_ID,
      stayRange,
      expiresAt: '2026-07-25T10:10:00.000Z',
      now: NOW,
      authorization: authorization('world-replayed-nonce', '1'),
    });

    await expect(
      repository.createActive({
        requestId: 'request-world-nonce-replay',
        listingId: LISTING_ID,
        guestProfileId: GUEST_TWO_ID,
        quoteId: QUOTE_TWO_ID,
        stayRange,
        expiresAt: '2026-07-25T10:10:00.000Z',
        now: NOW,
        authorization: authorization('world-replayed-nonce', '2'),
      }),
    ).rejects.toMatchObject({
      conflict: 'world_nonce_replayed',
    });
  });

  it('allows only one active hold per anonymous verified human', async () => {
    const stayRange = StayRange.fromStrings({
      checkIn: '2026-08-10',
      checkOut: '2026-08-15',
    });

    await repository.createActive({
      requestId: 'request-human-limit-first',
      listingId: LISTING_ID,
      guestProfileId: GUEST_ONE_ID,
      quoteId: QUOTE_ONE_ID,
      stayRange,
      expiresAt: '2026-07-25T10:10:00.000Z',
      now: NOW,
      authorization: authorization('world-human-limit-first', '1'),
    });

    await expect(
      repository.createActive({
        requestId: 'request-human-limit-second',
        listingId: LISTING_ID,
        guestProfileId: GUEST_TWO_ID,
        quoteId: QUOTE_TWO_ID,
        stayRange,
        expiresAt: '2026-07-25T10:10:00.000Z',
        now: NOW,
        authorization: {
          ...authorization('world-human-limit-second', '2'),
          anonymousHumanRefHash: '1'.repeat(64),
        },
      }),
    ).rejects.toMatchObject({
      conflict: 'human_active_hold_limit',
    });
  });

  it('rejects reuse of one request ID for different Booking terms', async () => {
    const stayRange = StayRange.fromStrings({
      checkIn: '2026-08-10',
      checkOut: '2026-08-15',
    });
    const requestId = 'request-reused-with-different-terms';

    await repository.createActive({
      requestId,
      listingId: LISTING_ID,
      guestProfileId: GUEST_ONE_ID,
      quoteId: QUOTE_ONE_ID,
      stayRange,
      expiresAt: '2026-07-25T10:10:00.000Z',
      now: NOW,
      authorization: authorization('world-reused-terms'),
    });

    await expect(
      repository.createActive({
        requestId,
        listingId: LISTING_ID,
        guestProfileId: GUEST_TWO_ID,
        quoteId: QUOTE_TWO_ID,
        stayRange,
        expiresAt: '2026-07-25T10:10:00.000Z',
        now: NOW,
        authorization: authorization('world-reused-terms'),
      }),
    ).rejects.toThrow('idempotency_key_reused');
  });

  it('expires a hold and makes its dates available again', async () => {
    const stayRange = StayRange.fromStrings({
      checkIn: '2026-08-10',
      checkOut: '2026-08-15',
    });
    const first = await repository.createActive({
      requestId: 'request-expiring',
      listingId: LISTING_ID,
      guestProfileId: GUEST_ONE_ID,
      quoteId: QUOTE_ONE_ID,
      stayRange,
      expiresAt: '2026-07-25T10:10:00.000Z',
      now: NOW,
      authorization: authorization('world-expiring', '1'),
    });

    expect(first.status).toBe('created');

    const expired = await repository.expireActive({
      now: '2026-07-25T10:11:00.000Z',
      limit: 100,
    });
    expect(expired).toHaveLength(1);
    expect(expired[0]?.status).toBe('expired');

    const replacement = await repository.createActive({
      requestId: 'request-after-expiry',
      listingId: LISTING_ID,
      guestProfileId: GUEST_TWO_ID,
      quoteId: QUOTE_TWO_ID,
      stayRange,
      expiresAt: '2026-07-25T10:20:00.000Z',
      now: '2026-07-25T10:11:00.000Z',
      authorization: authorization('world-after-expiry', '2'),
    });
    expect(replacement.status).toBe('created');
  });

  it('persists and reads a Booking without losing exact token amounts', async () => {
    const hold = await repository.createActive({
      requestId: 'request-for-booking',
      listingId: LISTING_ID,
      guestProfileId: GUEST_ONE_ID,
      quoteId: QUOTE_ONE_ID,
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
      }),
      expiresAt: '2026-07-25T10:10:00.000Z',
      now: NOW,
      authorization: authorization('world-for-booking'),
    });

    expect(hold.status).toBe('created');

    if (hold.status !== 'created') {
      return;
    }

    const bookingId = '50000000-0000-4000-8000-000000000001';
    await bookingRepository.save({
      id: bookingId,
      listingId: LISTING_ID,
      hostProfileId: HOST_ID,
      guestProfileId: GUEST_ONE_ID,
      quoteId: QUOTE_ONE_ID,
      holdId: hold.hold.id,
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
      }),
      settlementTokenId: '0.0.12345',
      staySubtotal: TokenAmount.fromAtomicUnits('50000'),
      depositAmount: TokenAmount.fromAtomicUnits('50000'),
      status: 'awaiting_deposit',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const saved = await bookingRepository.getById(bookingId);
    expect(saved?.status).toBe('awaiting_deposit');
    expect(saved?.staySubtotal.toString()).toBe('50000');
    expect(saved?.depositAmount.toString()).toBe('50000');
  });

  it('prepares an idempotent deposit and confirms all stored Booking state atomically', async () => {
    const createdHold = await repository.createActive({
      requestId: 'request-for-deposit-operation',
      listingId: LISTING_ID,
      guestProfileId: GUEST_ONE_ID,
      quoteId: QUOTE_ONE_ID,
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
      }),
      expiresAt: '2026-07-25T10:10:00.000Z',
      now: NOW,
      authorization: authorization('world-for-deposit'),
    });

    expect(createdHold.status).toBe('created');
    if (createdHold.status !== 'created') return;

    const booking = {
      id: '50000000-0000-4000-8000-000000000002',
      listingId: LISTING_ID,
      hostProfileId: HOST_ID,
      guestProfileId: GUEST_ONE_ID,
      quoteId: QUOTE_ONE_ID,
      holdId: createdHold.hold.id,
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-10',
        checkOut: '2026-08-15',
      }),
      settlementTokenId: '0.0.12345',
      staySubtotal: TokenAmount.fromAtomicUnits('50000'),
      depositAmount: TokenAmount.fromAtomicUnits('50000'),
      status: 'awaiting_deposit' as const,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await bookingRepository.save(booking);
    const input = {
      operationId: '80000000-0000-4000-8000-000000000001',
      escrowId: '81000000-0000-4000-8000-000000000001',
      paymentId: '82000000-0000-4000-8000-000000000001',
      idempotencyKey: 'postgres-deposit-request',
      booking,
      escrowRecipientRef: '0.0.2002',
      publicEvidenceRef: 'evidence-first-attempt',
      now: NOW,
    };

    const prepared = await depositRepository.prepare(input);
    const retry = await depositRepository.prepare({
      ...input,
      operationId: '80000000-0000-4000-8000-000000000002',
      escrowId: '81000000-0000-4000-8000-000000000002',
      paymentId: '82000000-0000-4000-8000-000000000002',
      publicEvidenceRef: 'evidence-retry-is-ignored',
    });

    expect(retry.operation.id).toBe(prepared.operation.id);
    expect(retry.operation.requestPayload.publicEvidenceRef).toBe('evidence-first-attempt');

    const reserved = await depositRepository.saveOperation({
      ...prepared.operation,
      providerTransactionId: '0.0.1001@1784980800.000000001',
      status: 'reserved',
      updatedAt: NOW,
    });
    await depositRepository.saveOperation({
      ...reserved.operation,
      status: 'submitted',
      attemptCount: 1,
      updatedAt: NOW,
    });
    const confirmed = await depositRepository.confirmDeposit({
      operationId: prepared.operation.id,
      transactionId: '0.0.1001@1784980800.000000001',
      providerResponse: { mirrorStatus: 'confirmed' },
      now: '2026-07-25T10:00:02.000Z',
    });

    expect(confirmed.operation.status).toBe('confirmed');
    expect(confirmed.booking.status).toBe('confirmed');
    expect(confirmed.hold.status).toBe('converted');
    expect(confirmed.escrow.status).toBe('funded');
    expect(confirmed.payment.status).toBe('confirmed');
  });

  it('keeps every marketplace table behind default-deny row-level security', async () => {
    const tables = await sql<{ relname: string; relrowsecurity: boolean }[]>`
      select class.relname, class.relrowsecurity
      from pg_class as class
      inner join pg_namespace as namespace on namespace.oid = class.relnamespace
      where namespace.nspname = 'nook'
        and class.relkind = 'r'
      order by class.relname
    `;
    const policies = await sql<{ policy_count: number }[]>`
      select count(*)::integer as policy_count
      from pg_policies
      where schemaname = 'nook'
    `;

    expect(tables).toHaveLength(17);
    expect(tables.every((table) => table.relrowsecurity)).toBe(true);
    expect(policies[0]?.policy_count).toBe(0);
  });
});

async function seedMarketplace(sql: PostgresClient): Promise<void> {
  await sql`
    insert into nook.profiles (id, role, public_ref)
    values
      (${HOST_ID}, 'host', 'host-lisbon'),
      (${GUEST_ONE_ID}, 'guest', 'guest-one'),
      (${GUEST_TWO_ID}, 'guest', 'guest-two')
  `;
  await sql`
    insert into nook.listings (
      id,
      host_profile_id,
      title,
      description,
      city,
      neighborhood,
      approximate_location_ref,
      amenities,
      house_rules,
      settlement_token_id,
      nightly_rate_atomic,
      base_deposit_atomic,
      max_guests,
      status
    )
    values (
      ${LISTING_ID},
      ${HOST_ID},
      'Alfama work-friendly nook',
      'A temporary Lisbon stay.',
      'Lisbon',
      'Alfama',
      'lisbon-alfama-demo-area',
      array['wifi', 'desk'],
      array['No smoking'],
      '0.0.12345',
      10000,
      50000,
      2,
      'published'
    )
  `;
  await sql`
    insert into nook.availability_windows (listing_id, check_in, check_out)
    values (${LISTING_ID}, '2026-08-01', '2026-09-01')
  `;
  await sql`
    insert into nook.booking_quotes (
      id,
      listing_id,
      guest_profile_id,
      check_in,
      check_out,
      settlement_token_id,
      nightly_rate_atomic,
      stay_subtotal_atomic,
      base_deposit_atomic,
      quoted_deposit_atomic,
      total_due_atomic,
      reputation_tier,
      expires_at,
      created_at
    )
    values
      (
        ${QUOTE_ONE_ID},
        ${LISTING_ID},
        ${GUEST_ONE_ID},
        '2026-08-10',
        '2026-08-15',
        '0.0.12345',
        10000,
        50000,
        50000,
        50000,
        100000,
        'silver',
        '2026-07-25T10:30:00.000Z',
        ${NOW}
      ),
      (
        ${QUOTE_TWO_ID},
        ${LISTING_ID},
        ${GUEST_TWO_ID},
        '2026-08-10',
        '2026-08-15',
        '0.0.12345',
        10000,
        50000,
        50000,
        75000,
        125000,
        'newcomer',
        '2026-07-25T10:30:00.000Z',
        ${NOW}
      )
  `;
}
