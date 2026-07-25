import { DomainConflictError } from '@nook-rent/core';
import type {
  AvailabilityWindow,
  AvailabilityWindowRepositoryPort,
  Booking,
  BookingQuote,
  BookingQuoteRepositoryPort,
  BookingRepositoryPort,
  BookingRequest,
  BookingRequestRepositoryPort,
  CreateReservationHoldInput,
  CreateReservationHoldResult,
  DepositOperationRepositoryPort,
  DepositOperationSnapshot,
  ExternalOperation,
  Listing,
  ListingApprovalPolicyRepositoryPort,
  ListingRepositoryPort,
  ListingSearch,
  MemberProfile,
  MemberProfileRepositoryPort,
  ReservationHold,
  ReservationHoldRepositoryPort,
  RentalReputationPort,
  RentalReputationTier,
  PrepareDepositOperationInput,
  StoredListingApprovalPolicy,
} from '@nook-rent/core';

import type { PostgresClient } from './client.js';
import {
  type AvailabilityWindowRow,
  type BookingRow,
  type BookingQuoteRow,
  type BookingRequestRow,
  type EscrowRow,
  type ExternalOperationRow,
  type ListingRow,
  mapAvailabilityWindowRow,
  mapBookingRow,
  mapBookingQuoteRow,
  mapBookingRequestRow,
  mapEscrowRow,
  mapExternalOperationRow,
  mapListingRow,
  mapMemberProfileRow,
  mapReservationHoldRow,
  mapPaymentRow,
  type MemberProfileRow,
  type PaymentRow,
  type ReservationHoldRow,
} from './mappers.js';

interface CreateHoldRow extends ReservationHoldRow {
  result_kind: 'conflict' | 'created' | 'idempotent';
}

interface ListingApprovalPolicyRow {
  listing_id: string;
  automatic_approval_enabled: boolean;
  minimum_rental_reputation_tier: string;
  version: number;
  updated_at: Date | string;
}

interface WorldIdVerificationRow {
  profile_id: string;
  nullifier: string;
}

function mapReputationTier(value: string): RentalReputationTier {
  switch (value) {
    case 'newcomer':
    case 'bronze':
    case 'silver':
    case 'gold':
      return value;
    default:
      throw new Error(`Unsupported Rental Reputation tier from database: ${value}`);
  }
}

function mapApprovalPolicyRow(row: ListingApprovalPolicyRow): StoredListingApprovalPolicy {
  return {
    listingId: row.listing_id,
    policy: {
      automaticApprovalEnabled: row.automatic_approval_enabled,
      minimumRentalReputationTier: mapReputationTier(row.minimum_rental_reputation_tier),
    },
    version: row.version,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : new Date(row.updated_at).toISOString(),
  };
}

export class PostgresMemberProfileRepository implements MemberProfileRepositoryPort {
  constructor(private readonly sql: PostgresClient) {}

  async getById(id: string): Promise<MemberProfile | undefined> {
    const [row] = await this.sql<MemberProfileRow[]>`
      select *
      from nook.profiles
      where id = ${id}
    `;

    return row ? mapMemberProfileRow(row) : undefined;
  }

  async save(profile: MemberProfile): Promise<void> {
    await this.sql`
      insert into nook.profiles (id, role, public_ref, created_at)
      values (${profile.id}, ${profile.role}, ${profile.publicRef}, ${profile.createdAt})
      on conflict (id) do update
      set
        role = excluded.role,
        public_ref = excluded.public_ref
    `;
  }
}

export interface RecordWorldIdVerificationInput {
  profileId: string;
  provider: 'world_id';
  credential: 'proof_of_human';
  action: string;
  environment: 'production' | 'staging' | 'sandbox';
  protocolVersion: '3.0' | '4.0';
  nullifierDecimal: string;
  verifiedAt: string;
}

export class PostgresWorldIdVerificationRepository {
  constructor(private readonly sql: PostgresClient) {}

  async isVerified(input: { profileId: string; action: string }): Promise<boolean> {
    const [verification] = await this.sql<{ verified: boolean }[]>`
      select true as verified
      from nook.world_id_verifications
      where profile_id = ${input.profileId}
        and role = 'member'
        and action = ${input.action}
      limit 1
    `;

    return verification?.verified === true;
  }

  async record(input: RecordWorldIdVerificationInput): Promise<'created' | 'idempotent'> {
    const [profileVerification] = await this.sql<WorldIdVerificationRow[]>`
      select profile_id, nullifier::text
      from nook.world_id_verifications
      where profile_id = ${input.profileId}
        and role = 'member'
        and action = ${input.action}
    `;

    if (profileVerification) {
      if (profileVerification.nullifier === input.nullifierDecimal) {
        return 'idempotent';
      }

      throw new DomainConflictError(
        'world_id_already_bound',
        'This Member profile is already bound to another World ID verification',
      );
    }

    const [humanVerification] = await this.sql<WorldIdVerificationRow[]>`
      select profile_id, nullifier::text
      from nook.world_id_verifications
      where nullifier = ${input.nullifierDecimal}
        and action = ${input.action}
    `;

    if (humanVerification && humanVerification.profile_id !== input.profileId) {
      throw new DomainConflictError(
        'world_id_already_bound',
        'This World ID verification is already bound to another Member profile',
      );
    }

    await this.sql`
      insert into nook.world_id_verifications (
        profile_id,
        role,
        provider,
        credential,
        action,
        environment,
        protocol_version,
        nullifier,
        verified_at
      )
      values (
        ${input.profileId},
        'member',
        ${input.provider},
        ${input.credential},
        ${input.action},
        ${input.environment},
        ${input.protocolVersion},
        ${input.nullifierDecimal},
        ${input.verifiedAt}
      )
    `;

    return 'created';
  }
}

export class PostgresListingRepository implements ListingRepositoryPort {
  constructor(private readonly sql: PostgresClient) {}

  async getById(id: string): Promise<Listing | undefined> {
    const [row] = await this.sql<ListingRow[]>`
      select *
      from nook.listings
      where id = ${id}
    `;

    return row ? mapListingRow(row) : undefined;
  }

  async save(listing: Listing): Promise<void> {
    await this.sql`
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
        status,
        created_at,
        updated_at
      )
      values (
        ${listing.id},
        ${listing.hostProfileId},
        ${listing.title},
        ${listing.description},
        ${listing.city},
        ${listing.neighborhood},
        ${listing.approximateLocationRef},
        ${this.sql.array(listing.amenities)},
        ${this.sql.array(listing.houseRules)},
        ${listing.settlementTokenId},
        ${listing.nightlyRate.toString()},
        ${listing.baseDeposit.toString()},
        ${listing.maxGuests},
        ${listing.status},
        ${listing.createdAt},
        ${listing.updatedAt}
      )
      on conflict (id) do update
      set
        host_profile_id = excluded.host_profile_id,
        title = excluded.title,
        description = excluded.description,
        city = excluded.city,
        neighborhood = excluded.neighborhood,
        approximate_location_ref = excluded.approximate_location_ref,
        amenities = excluded.amenities,
        house_rules = excluded.house_rules,
        settlement_token_id = excluded.settlement_token_id,
        nightly_rate_atomic = excluded.nightly_rate_atomic,
        base_deposit_atomic = excluded.base_deposit_atomic,
        max_guests = excluded.max_guests,
        status = excluded.status,
        updated_at = excluded.updated_at
    `;
  }

  async search(input: ListingSearch): Promise<Listing[]> {
    const maximumNightlyRate = input.maximumNightlyRate?.toString() ?? null;
    const rows = await this.sql<ListingRow[]>`
      select distinct listing.*
      from nook.listings as listing
      inner join nook.availability_windows as availability
        on availability.listing_id = listing.id
      where listing.status = 'published'
        and lower(listing.city) = lower(${input.city})
        and listing.max_guests >= ${input.guests}
        and availability.check_in <= ${input.stayRange.checkIn.toString()}::date
        and availability.check_out >= ${input.stayRange.checkOut.toString()}::date
        and (
          ${maximumNightlyRate}::numeric is null
          or listing.nightly_rate_atomic <= ${maximumNightlyRate}::numeric
        )
        and listing.amenities @> ${this.sql.array(input.requiredAmenities)}::text[]
      order by listing.nightly_rate_atomic, listing.id
    `;

    return rows.map(mapListingRow);
  }
}

export class PostgresAvailabilityWindowRepository implements AvailabilityWindowRepositoryPort {
  constructor(private readonly sql: PostgresClient) {}

  async listForListing(listingId: string): Promise<AvailabilityWindow[]> {
    const rows = await this.sql<AvailabilityWindowRow[]>`
      select *
      from nook.availability_windows
      where listing_id = ${listingId}
      order by check_in, check_out, id
    `;

    return rows.map(mapAvailabilityWindowRow);
  }

  async replaceForListing(listingId: string, windows: AvailabilityWindow[]): Promise<void> {
    if (windows.some((window) => window.listingId !== listingId)) {
      throw new Error('Every Availability Window must belong to the target Listing');
    }

    await this.sql.begin(async (transaction) => {
      await transaction`
        delete from nook.availability_windows
        where listing_id = ${listingId}
      `;

      for (const window of windows) {
        await transaction`
          insert into nook.availability_windows (
            id,
            listing_id,
            check_in,
            check_out,
            created_at
          )
          values (
            ${window.id},
            ${window.listingId},
            ${window.stayRange.checkIn.toString()}::date,
            ${window.stayRange.checkOut.toString()}::date,
            ${window.createdAt}
          )
        `;
      }
    });
  }
}

export class PostgresListingApprovalPolicyRepository implements ListingApprovalPolicyRepositoryPort {
  constructor(private readonly sql: PostgresClient) {}

  async getByListingId(listingId: string): Promise<StoredListingApprovalPolicy | undefined> {
    const [row] = await this.sql<ListingApprovalPolicyRow[]>`
      select *
      from nook.listing_approval_policies
      where listing_id = ${listingId}
    `;

    return row ? mapApprovalPolicyRow(row) : undefined;
  }

  async save(policy: StoredListingApprovalPolicy): Promise<void> {
    await this.sql`
      insert into nook.listing_approval_policies (
        listing_id,
        automatic_approval_enabled,
        minimum_rental_reputation_tier,
        version,
        updated_at
      )
      values (
        ${policy.listingId},
        ${policy.policy.automaticApprovalEnabled},
        ${policy.policy.minimumRentalReputationTier},
        ${policy.version},
        ${policy.updatedAt}
      )
      on conflict (listing_id) do update
      set
        automatic_approval_enabled = excluded.automatic_approval_enabled,
        minimum_rental_reputation_tier = excluded.minimum_rental_reputation_tier,
        version = excluded.version,
        updated_at = excluded.updated_at
    `;
  }
}

export class PostgresBookingQuoteRepository implements BookingQuoteRepositoryPort {
  constructor(private readonly sql: PostgresClient) {}

  async getById(id: string): Promise<BookingQuote | undefined> {
    const [row] = await this.sql<BookingQuoteRow[]>`
      select *
      from nook.booking_quotes
      where id = ${id}
    `;

    return row ? mapBookingQuoteRow(row) : undefined;
  }

  async save(quote: BookingQuote): Promise<void> {
    await this.sql`
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
      values (
        ${quote.id},
        ${quote.listingId},
        ${quote.guestProfileId},
        ${quote.stayRange.checkIn.toString()}::date,
        ${quote.stayRange.checkOut.toString()}::date,
        ${quote.settlementTokenId},
        ${quote.nightlyRate.toString()},
        ${quote.staySubtotal.toString()},
        ${quote.baseDeposit.toString()},
        ${quote.quotedDeposit.toString()},
        ${quote.totalDue.toString()},
        ${quote.reputationTier},
        ${quote.expiresAt},
        ${quote.createdAt}
      )
    `;
  }
}

export class PostgresReservationHoldRepository implements ReservationHoldRepositoryPort {
  constructor(private readonly sql: PostgresClient) {}

  async createActive(input: CreateReservationHoldInput): Promise<CreateReservationHoldResult> {
    let row: CreateHoldRow | undefined;

    try {
      [row] = await this.sql<CreateHoldRow[]>`
        select *
        from nook.create_human_backed_reservation_hold(
          ${input.requestId},
          ${input.listingId}::uuid,
          ${input.guestProfileId}::uuid,
          ${input.quoteId}::uuid,
          ${input.stayRange.checkIn.toString()}::date,
          ${input.stayRange.checkOut.toString()}::date,
          ${input.expiresAt}::timestamptz,
          ${input.now}::timestamptz,
          ${input.authorization.provider},
          ${input.authorization.agentAddress},
          ${input.authorization.anonymousHumanRefHash},
          ${input.authorization.nonce}
        )
      `;
    } catch (error) {
      const message = error instanceof Error ? error.message : '';

      if (message.includes('world_nonce_replayed')) {
        throw new DomainConflictError(
          'world_nonce_replayed',
          'This World AgentKit authorization nonce has already been used',
        );
      }

      if (message.includes('human_active_hold_limit')) {
        throw new DomainConflictError(
          'human_active_hold_limit',
          'This verified human already has an active Reservation Hold',
        );
      }

      if (message.includes('agent_profile_mismatch')) {
        throw new DomainConflictError(
          'agent_profile_mismatch',
          'This Agent wallet is already bound to a different Guest Profile',
        );
      }

      throw error;
    }

    if (!row) {
      throw new Error('Reservation Hold function returned no result');
    }

    if (row.result_kind === 'conflict') {
      return { status: 'conflict' };
    }

    const hold = mapReservationHoldRow(row);
    return row.result_kind === 'created'
      ? { status: 'created', hold }
      : { status: 'idempotent', hold };
  }

  async expireActive(input: { now: string; limit: number }): Promise<ReservationHold[]> {
    const rows = await this.sql<ReservationHoldRow[]>`
      select *
      from nook.expire_reservation_holds(
        ${input.now}::timestamptz,
        ${input.limit}
      )
    `;

    return rows.map(mapReservationHoldRow);
  }

  async getById(id: string): Promise<ReservationHold | undefined> {
    const [row] = await this.sql<ReservationHoldRow[]>`
      select *
      from nook.reservation_holds
      where id = ${id}
    `;

    return row ? mapReservationHoldRow(row) : undefined;
  }

  async save(hold: ReservationHold): Promise<void> {
    const rows = await this.sql<{ id: string }[]>`
      update nook.reservation_holds
      set
        status = ${hold.status},
        expires_at = ${hold.expiresAt},
        updated_at = ${hold.updatedAt}
      where id = ${hold.id}
        and listing_id = ${hold.listingId}
        and guest_profile_id = ${hold.guestProfileId}
        and quote_id = ${hold.quoteId}
        and check_in = ${hold.stayRange.checkIn.toString()}::date
        and check_out = ${hold.stayRange.checkOut.toString()}::date
      returning id
    `;

    if (rows.length !== 1) {
      throw new Error(`Reservation Hold not found or immutable fields changed: ${hold.id}`);
    }
  }
}

export class PostgresBookingRepository implements BookingRepositoryPort {
  constructor(private readonly sql: PostgresClient) {}

  async getById(id: string): Promise<Booking | undefined> {
    const [row] = await this.sql<BookingRow[]>`
      select *
      from nook.bookings
      where id = ${id}
    `;

    return row ? mapBookingRow(row) : undefined;
  }

  async getByHoldId(holdId: string): Promise<Booking | undefined> {
    const [row] = await this.sql<BookingRow[]>`
      select *
      from nook.bookings
      where hold_id = ${holdId}
    `;

    return row ? mapBookingRow(row) : undefined;
  }

  async save(booking: Booking): Promise<void> {
    await this.sql`
      insert into nook.bookings (
        id,
        listing_id,
        host_profile_id,
        guest_profile_id,
        quote_id,
        hold_id,
        check_in,
        check_out,
        settlement_token_id,
        stay_subtotal_atomic,
        deposit_amount_atomic,
        status,
        created_at,
        updated_at
      )
      values (
        ${booking.id},
        ${booking.listingId},
        ${booking.hostProfileId},
        ${booking.guestProfileId},
        ${booking.quoteId},
        ${booking.holdId},
        ${booking.stayRange.checkIn.toString()}::date,
        ${booking.stayRange.checkOut.toString()}::date,
        ${booking.settlementTokenId},
        ${booking.staySubtotal.toString()},
        ${booking.depositAmount.toString()},
        ${booking.status},
        ${booking.createdAt},
        ${booking.updatedAt}
      )
      on conflict (id) do update
      set
        status = excluded.status,
        updated_at = excluded.updated_at
    `;
  }
}

export class PostgresBookingRequestRepository implements BookingRequestRepositoryPort {
  constructor(private readonly sql: PostgresClient) {}

  async getByHoldId(holdId: string): Promise<BookingRequest | undefined> {
    const [row] = await this.sql<BookingRequestRow[]>`
      select *
      from nook.booking_requests
      where hold_id = ${holdId}
    `;

    return row ? mapBookingRequestRow(row) : undefined;
  }

  async getById(id: string): Promise<BookingRequest | undefined> {
    const [row] = await this.sql<BookingRequestRow[]>`
      select *
      from nook.booking_requests
      where id = ${id}
    `;

    return row ? mapBookingRequestRow(row) : undefined;
  }

  async save(request: BookingRequest): Promise<void> {
    await this.sql`
      insert into nook.booking_requests (
        id,
        hold_id,
        listing_id,
        guest_profile_id,
        approval_result,
        approval_reason,
        policy_version,
        status,
        created_at,
        updated_at
      )
      values (
        ${request.id},
        ${request.holdId},
        ${request.listingId},
        ${request.guestProfileId},
        ${request.approvalResult},
        ${request.approvalReason ?? null},
        ${request.policyVersion},
        ${request.status},
        ${request.createdAt},
        ${request.updatedAt}
      )
      on conflict (id) do update
      set
        approval_result = excluded.approval_result,
        approval_reason = excluded.approval_reason,
        status = excluded.status,
        updated_at = excluded.updated_at
    `;
  }
}

export class PostgresRentalReputationRepository implements RentalReputationPort {
  constructor(private readonly sql: PostgresClient) {}

  async getTier(profileId: string): Promise<RentalReputationTier> {
    const [row] = await this.sql<{ tier: string }[]>`
      select tier
      from nook.reputation_projections
      where profile_id = ${profileId}
    `;

    return row ? mapReputationTier(row.tier) : 'newcomer';
  }
}

function depositRequestPayload(input: PrepareDepositOperationInput) {
  return {
    amountAtomic: input.booking.depositAmount.toString(),
    bookingId: input.booking.id,
    escrowRecipientRef: input.escrowRecipientRef,
    publicEvidenceRef: input.publicEvidenceRef,
    tokenId: input.booking.settlementTokenId,
    version: 1,
  };
}

function sameScalarRecord(
  left: Record<string, string | number | boolean | null>,
  right: Record<string, string | number | boolean | null>,
): boolean {
  const leftEntries = Object.entries(left).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );
  const rightEntries = Object.entries(right).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  );

  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function depositTerms(
  payload: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> {
  return {
    amountAtomic: payload.amountAtomic ?? null,
    bookingId: payload.bookingId ?? null,
    escrowRecipientRef: payload.escrowRecipientRef ?? null,
    tokenId: payload.tokenId ?? null,
    version: payload.version ?? null,
  };
}

function requireSingleMutation(rows: { id: string }[], context: string): void {
  if (rows.length !== 1) {
    throw new Error(`${context} expected one stored row, received ${rows.length}`);
  }
}

export class PostgresDepositOperationRepository implements DepositOperationRepositoryPort {
  constructor(private readonly sql: PostgresClient) {}

  async prepare(input: PrepareDepositOperationInput): Promise<DepositOperationSnapshot> {
    const requestPayload = depositRequestPayload(input);

    await this.sql.begin(async (transaction) => {
      await transaction`
        insert into nook.operations (
          id,
          operation_kind,
          idempotency_key,
          aggregate_type,
          aggregate_id,
          provider,
          status,
          request_payload,
          created_at,
          updated_at
        )
        values (
          ${input.operationId},
          'hedera_deposit',
          ${input.idempotencyKey},
          'booking',
          ${input.booking.id},
          'hedera',
          'pending',
          ${transaction.json(requestPayload)},
          ${input.now},
          ${input.now}
        )
        on conflict do nothing
      `;

      const [operationRow] = await transaction<ExternalOperationRow[]>`
        select *
        from nook.operations
        where operation_kind = 'hedera_deposit'
          and idempotency_key = ${input.idempotencyKey}
        for update
      `;

      if (!operationRow) {
        throw new DomainConflictError(
          'deposit_operation_already_exists',
          `A different deposit Operation already exists for ${input.booking.id}`,
        );
      }

      const operation = mapExternalOperationRow(operationRow);

      if (
        operation.aggregateId !== input.booking.id ||
        !sameScalarRecord(depositTerms(operation.requestPayload), depositTerms(requestPayload))
      ) {
        throw new DomainConflictError(
          'deposit_idempotency_key_reused',
          'Deposit idempotency key was reused with different terms',
        );
      }

      await transaction`
        insert into nook.escrows (
          id,
          booking_id,
          token_id,
          amount_atomic,
          status,
          created_at,
          updated_at
        )
        values (
          ${input.escrowId},
          ${input.booking.id},
          ${input.booking.settlementTokenId},
          ${input.booking.depositAmount.toString()},
          'pending',
          ${input.now},
          ${input.now}
        )
        on conflict (booking_id) do nothing
      `;
      await transaction`
        insert into nook.payments (
          id,
          booking_id,
          payment_kind,
          token_id,
          amount_atomic,
          recipient_ref,
          status,
          operation_id,
          created_at,
          updated_at
        )
        values (
          ${input.paymentId},
          ${input.booking.id},
          'deposit',
          ${input.booking.settlementTokenId},
          ${input.booking.depositAmount.toString()},
          ${input.escrowRecipientRef},
          'pending',
          ${operation.id},
          ${input.now},
          ${input.now}
        )
        on conflict (booking_id, payment_kind) do nothing
      `;
    });

    const snapshot = await this.getByIdOrThrowByKey(input.idempotencyKey);

    if (
      snapshot.escrow.tokenId !== input.booking.settlementTokenId ||
      !snapshot.escrow.amount.equals(input.booking.depositAmount) ||
      snapshot.payment.recipientRef !== input.escrowRecipientRef ||
      snapshot.payment.operationId !== snapshot.operation.id
    ) {
      throw new DomainConflictError(
        'deposit_terms_mismatch',
        'Stored deposit resources do not match the accepted Booking terms',
      );
    }

    return snapshot;
  }

  async getById(operationId: string): Promise<DepositOperationSnapshot | undefined> {
    const [operationRow] = await this.sql<ExternalOperationRow[]>`
      select *
      from nook.operations
      where id = ${operationId}
        and operation_kind = 'hedera_deposit'
    `;

    return operationRow ? this.loadSnapshot(mapExternalOperationRow(operationRow)) : undefined;
  }

  async saveOperation(operation: ExternalOperation): Promise<DepositOperationSnapshot> {
    const rows = await this.sql<{ id: string }[]>`
      update nook.operations
      set
        provider_transaction_id = ${operation.providerTransactionId ?? null},
        status = ${operation.status},
        provider_response = ${operation.providerResponse ? this.sql.json(operation.providerResponse) : null},
        failure_code = ${operation.failureCode ?? null},
        attempt_count = ${operation.attemptCount},
        next_attempt_at = ${operation.nextAttemptAt ?? null},
        updated_at = ${operation.updatedAt}
      where id = ${operation.id}
        and operation_kind = ${operation.kind}
        and idempotency_key = ${operation.idempotencyKey}
        and aggregate_type = ${operation.aggregateType}
        and aggregate_id = ${operation.aggregateId}
        and provider = ${operation.provider}
        and request_payload = ${this.sql.json(operation.requestPayload)}
      returning id
    `;

    if (rows.length !== 1) {
      throw new Error(`Deposit Operation not found or immutable fields changed: ${operation.id}`);
    }

    return this.getByIdOrThrow(operation.id);
  }

  async confirmDeposit(input: {
    operationId: string;
    transactionId: string;
    providerResponse: Record<string, string | number | boolean | null>;
    now: string;
  }): Promise<DepositOperationSnapshot> {
    await this.sql.begin(async (transaction) => {
      const operations = await transaction<{ id: string }[]>`
        update nook.operations
        set
          provider_transaction_id = ${input.transactionId},
          status = 'confirmed',
          provider_response = ${transaction.json(input.providerResponse)},
          failure_code = null,
          next_attempt_at = null,
          updated_at = ${input.now}
        where id = ${input.operationId}
          and operation_kind = 'hedera_deposit'
          and status in ('submitted', 'reconciling', 'confirmed')
          and (
            provider_transaction_id is null
            or provider_transaction_id = ${input.transactionId}
          )
        returning id
      `;

      if (operations.length !== 1) {
        throw new Error(`Deposit Operation cannot be confirmed: ${input.operationId}`);
      }

      const escrows = await transaction<{ id: string }[]>`
        update nook.escrows
        set
          status = 'funded',
          funded_transaction_id = ${input.transactionId},
          updated_at = ${input.now}
        where booking_id = (
          select aggregate_id
          from nook.operations
          where id = ${input.operationId}
        )
        returning id
      `;
      const payments = await transaction<{ id: string }[]>`
        update nook.payments
        set
          status = 'confirmed',
          updated_at = ${input.now}
        where operation_id = ${input.operationId}
          and payment_kind = 'deposit'
        returning id
      `;
      const bookings = await transaction<{ id: string }[]>`
        update nook.bookings
        set
          status = 'confirmed',
          updated_at = ${input.now}
        where id = (
          select aggregate_id
          from nook.operations
          where id = ${input.operationId}
        )
          and status in ('awaiting_deposit', 'confirmed')
        returning id
      `;
      const holds = await transaction<{ id: string }[]>`
        update nook.reservation_holds
        set
          status = 'converted',
          updated_at = ${input.now}
        where id = (
          select booking.hold_id
          from nook.bookings as booking
          inner join nook.operations as operation
            on operation.aggregate_id = booking.id
          where operation.id = ${input.operationId}
        )
          and status in ('active', 'expired', 'converted')
        returning id
      `;

      requireSingleMutation(escrows, 'Deposit Escrow confirmation');
      requireSingleMutation(payments, 'Deposit Payment confirmation');
      requireSingleMutation(bookings, 'Deposit Booking confirmation');
      requireSingleMutation(holds, 'Deposit Reservation Hold conversion');
    });

    return this.getByIdOrThrow(input.operationId);
  }

  async failDeposit(input: {
    operationId: string;
    failureCode: string;
    providerResponse: Record<string, string | number | boolean | null>;
    now: string;
  }): Promise<DepositOperationSnapshot> {
    await this.sql.begin(async (transaction) => {
      const operations = await transaction<{ id: string }[]>`
        update nook.operations
        set
          status = 'failed',
          provider_response = ${transaction.json(input.providerResponse)},
          failure_code = ${input.failureCode},
          next_attempt_at = null,
          updated_at = ${input.now}
        where id = ${input.operationId}
          and operation_kind = 'hedera_deposit'
          and status in ('reserved', 'submitted', 'reconciling', 'failed')
        returning id
      `;

      if (operations.length !== 1) {
        throw new Error(`Deposit Operation cannot be failed: ${input.operationId}`);
      }

      const escrows = await transaction<{ id: string }[]>`
        update nook.escrows
        set status = 'failed', updated_at = ${input.now}
        where booking_id = (
          select aggregate_id
          from nook.operations
          where id = ${input.operationId}
        )
        returning id
      `;
      const payments = await transaction<{ id: string }[]>`
        update nook.payments
        set status = 'failed', updated_at = ${input.now}
        where operation_id = ${input.operationId}
          and payment_kind = 'deposit'
        returning id
      `;
      const bookings = await transaction<{ id: string }[]>`
        update nook.bookings
        set status = 'expired', updated_at = ${input.now}
        where id = (
          select aggregate_id
          from nook.operations
          where id = ${input.operationId}
        )
          and status in ('awaiting_deposit', 'expired')
        returning id
      `;
      const holds = await transaction<{ id: string }[]>`
        update nook.reservation_holds
        set status = 'released', updated_at = ${input.now}
        where id = (
          select booking.hold_id
          from nook.bookings as booking
          inner join nook.operations as operation
            on operation.aggregate_id = booking.id
          where operation.id = ${input.operationId}
        )
          and status in ('active', 'expired', 'released')
        returning id
      `;

      requireSingleMutation(escrows, 'Failed Deposit Escrow');
      requireSingleMutation(payments, 'Failed Deposit Payment');
      requireSingleMutation(bookings, 'Failed Deposit Booking');
      requireSingleMutation(holds, 'Failed Deposit Reservation Hold release');
    });

    return this.getByIdOrThrow(input.operationId);
  }

  private async getByIdOrThrow(operationId: string): Promise<DepositOperationSnapshot> {
    const snapshot = await this.getById(operationId);

    if (!snapshot) {
      throw new Error(`Deposit Operation not found: ${operationId}`);
    }

    return snapshot;
  }

  private async getByIdOrThrowByKey(idempotencyKey: string): Promise<DepositOperationSnapshot> {
    const [operationRow] = await this.sql<ExternalOperationRow[]>`
      select *
      from nook.operations
      where operation_kind = 'hedera_deposit'
        and idempotency_key = ${idempotencyKey}
    `;

    if (!operationRow) {
      throw new Error(`Deposit Operation not found for idempotency key`);
    }

    return this.loadSnapshot(mapExternalOperationRow(operationRow));
  }

  private async loadSnapshot(operation: ExternalOperation): Promise<DepositOperationSnapshot> {
    const [[bookingRow], [holdRow], [escrowRow], [paymentRow]] = await Promise.all([
      this.sql<BookingRow[]>`
        select *
        from nook.bookings
        where id = ${operation.aggregateId}
      `,
      this.sql<ReservationHoldRow[]>`
        select hold.*
        from nook.reservation_holds as hold
        inner join nook.bookings as booking on booking.hold_id = hold.id
        where booking.id = ${operation.aggregateId}
      `,
      this.sql<EscrowRow[]>`
        select *
        from nook.escrows
        where booking_id = ${operation.aggregateId}
      `,
      this.sql<PaymentRow[]>`
        select *
        from nook.payments
        where operation_id = ${operation.id}
          and payment_kind = 'deposit'
      `,
    ]);

    if (!bookingRow || !holdRow || !escrowRow || !paymentRow) {
      throw new Error(`Deposit Operation is missing related stored state: ${operation.id}`);
    }

    return {
      operation,
      booking: mapBookingRow(bookingRow),
      hold: mapReservationHoldRow(holdRow),
      escrow: mapEscrowRow(escrowRow),
      payment: mapPaymentRow(paymentRow),
    };
  }
}
