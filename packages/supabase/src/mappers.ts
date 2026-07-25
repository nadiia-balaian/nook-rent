import {
  type AvailabilityWindow,
  type Booking,
  type BookingQuote,
  type BookingRequest,
  type BookingRequestApprovalResult,
  type BookingRequestStatus,
  type BookingStatus,
  type Escrow,
  type EscrowStatus,
  type ExternalOperation,
  type ExternalOperationStatus,
  type Listing,
  type ListingStatus,
  type MemberProfile,
  type MemberRole,
  type Payment,
  type PaymentStatus,
  type ReservationHold,
  type ReservationHoldStatus,
  type RentalReputationTier,
  StayRange,
  TokenAmount,
} from '@nook-rent/core';

type DatabaseTimestamp = Date | string;
type DatabaseDate = Date | string;

export interface ListingRow {
  id: string;
  host_profile_id: string;
  title: string;
  description: string;
  city: string;
  neighborhood: string;
  approximate_location_ref: string;
  amenities: string[];
  house_rules: string[];
  settlement_token_id: string;
  nightly_rate_atomic: string;
  base_deposit_atomic: string;
  max_guests: number;
  status: string;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

export interface ReservationHoldRow {
  id: string;
  request_id: string;
  listing_id: string;
  guest_profile_id: string;
  quote_id: string;
  check_in: DatabaseDate;
  check_out: DatabaseDate;
  status: string;
  expires_at: DatabaseTimestamp;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

export interface MemberProfileRow {
  id: string;
  role: string;
  public_ref: string;
  created_at: DatabaseTimestamp;
}

export interface AvailabilityWindowRow {
  id: string;
  listing_id: string;
  check_in: DatabaseDate;
  check_out: DatabaseDate;
  created_at: DatabaseTimestamp;
}

export interface BookingQuoteRow {
  id: string;
  listing_id: string;
  guest_profile_id: string;
  check_in: DatabaseDate;
  check_out: DatabaseDate;
  settlement_token_id: string;
  nightly_rate_atomic: string;
  stay_subtotal_atomic: string;
  base_deposit_atomic: string;
  quoted_deposit_atomic: string;
  total_due_atomic: string;
  reputation_tier: string;
  expires_at: DatabaseTimestamp;
  created_at: DatabaseTimestamp;
}

export interface BookingRequestRow {
  id: string;
  hold_id: string;
  listing_id: string;
  guest_profile_id: string;
  approval_result: string;
  approval_reason: string | null;
  policy_version: number;
  status: string;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

export interface BookingRow {
  id: string;
  listing_id: string;
  host_profile_id: string;
  guest_profile_id: string;
  quote_id: string;
  hold_id: string;
  check_in: DatabaseDate;
  check_out: DatabaseDate;
  settlement_token_id: string;
  stay_subtotal_atomic: string;
  deposit_amount_atomic: string;
  status: string;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

export interface ExternalOperationRow {
  id: string;
  operation_kind: string;
  idempotency_key: string;
  aggregate_type: string;
  aggregate_id: string;
  provider: string;
  provider_transaction_id: string | null;
  status: string;
  request_payload: unknown;
  provider_response: unknown;
  failure_code: string | null;
  attempt_count: number;
  next_attempt_at: DatabaseTimestamp | null;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

export interface EscrowRow {
  id: string;
  booking_id: string;
  token_id: string;
  amount_atomic: string;
  status: string;
  funded_transaction_id: string | null;
  release_transaction_id: string | null;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

export interface PaymentRow {
  id: string;
  booking_id: string;
  payment_kind: string;
  token_id: string;
  amount_atomic: string;
  recipient_ref: string;
  status: string;
  operation_id: string;
  created_at: DatabaseTimestamp;
  updated_at: DatabaseTimestamp;
}

function toIsoTimestamp(value: DatabaseTimestamp): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toLocalDate(value: DatabaseDate): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function listingStatus(value: string): ListingStatus {
  switch (value) {
    case 'draft':
    case 'published':
    case 'paused':
    case 'archived':
      return value;
    default:
      throw new Error(`Unsupported Listing status from database: ${value}`);
  }
}

function memberRole(value: string): MemberRole {
  switch (value) {
    case 'host':
    case 'guest':
    case 'both':
      return value;
    default:
      throw new Error(`Unsupported Member role from database: ${value}`);
  }
}

function reputationTier(value: string): RentalReputationTier {
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

function holdStatus(value: string): ReservationHoldStatus {
  switch (value) {
    case 'active':
    case 'converted':
    case 'released':
    case 'expired':
      return value;
    default:
      throw new Error(`Unsupported Reservation Hold status from database: ${value}`);
  }
}

function bookingStatus(value: string): BookingStatus {
  switch (value) {
    case 'request_received':
    case 'approval_pending':
    case 'awaiting_deposit':
    case 'confirmed':
    case 'checked_in':
    case 'checkout_pending':
    case 'completed':
    case 'rejected':
    case 'expired':
    case 'cancelled':
    case 'disputed':
      return value;
    default:
      throw new Error(`Unsupported Booking status from database: ${value}`);
  }
}

function bookingRequestStatus(value: string): BookingRequestStatus {
  switch (value) {
    case 'pending':
    case 'approved':
    case 'rejected':
    case 'expired':
    case 'cancelled':
      return value;
    default:
      throw new Error(`Unsupported Booking Request status from database: ${value}`);
  }
}

function bookingRequestApprovalResult(value: string): BookingRequestApprovalResult {
  switch (value) {
    case 'host_review':
    case 'auto_approved':
    case 'approved':
    case 'rejected':
      return value;
    default:
      throw new Error(`Unsupported Booking Request result from database: ${value}`);
  }
}

function externalOperationStatus(value: string): ExternalOperationStatus {
  switch (value) {
    case 'pending':
    case 'reserved':
    case 'submitted':
    case 'confirmed':
    case 'failed':
    case 'reconciling':
      return value;
    default:
      throw new Error(`Unsupported Operation status from database: ${value}`);
  }
}

function escrowStatus(value: string): EscrowStatus {
  switch (value) {
    case 'pending':
    case 'submitted':
    case 'funded':
    case 'release_pending':
    case 'released':
    case 'refunded':
    case 'failed':
      return value;
    default:
      throw new Error(`Unsupported Escrow status from database: ${value}`);
  }
}

function paymentStatus(value: string): PaymentStatus {
  switch (value) {
    case 'pending':
    case 'submitted':
    case 'confirmed':
    case 'failed':
      return value;
    default:
      throw new Error(`Unsupported Payment status from database: ${value}`);
  }
}

function scalarRecord(
  value: unknown,
  field: string,
): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} from database must be an object`);
  }

  const entries = Object.entries(value);

  if (
    entries.some(
      ([, item]) =>
        item !== null &&
        typeof item !== 'string' &&
        typeof item !== 'number' &&
        typeof item !== 'boolean',
    )
  ) {
    throw new Error(`${field} from database contains a non-scalar value`);
  }

  return Object.fromEntries(entries);
}

export function mapMemberProfileRow(row: MemberProfileRow): MemberProfile {
  return {
    id: row.id,
    role: memberRole(row.role),
    publicRef: row.public_ref,
    createdAt: toIsoTimestamp(row.created_at),
  };
}

export function mapAvailabilityWindowRow(row: AvailabilityWindowRow): AvailabilityWindow {
  return {
    id: row.id,
    listingId: row.listing_id,
    stayRange: StayRange.fromStrings({
      checkIn: toLocalDate(row.check_in),
      checkOut: toLocalDate(row.check_out),
    }),
    createdAt: toIsoTimestamp(row.created_at),
  };
}

export function mapBookingQuoteRow(row: BookingQuoteRow): BookingQuote {
  return {
    id: row.id,
    listingId: row.listing_id,
    guestProfileId: row.guest_profile_id,
    stayRange: StayRange.fromStrings({
      checkIn: toLocalDate(row.check_in),
      checkOut: toLocalDate(row.check_out),
    }),
    settlementTokenId: row.settlement_token_id,
    nightlyRate: TokenAmount.fromAtomicUnits(row.nightly_rate_atomic),
    staySubtotal: TokenAmount.fromAtomicUnits(row.stay_subtotal_atomic),
    baseDeposit: TokenAmount.fromAtomicUnits(row.base_deposit_atomic),
    quotedDeposit: TokenAmount.fromAtomicUnits(row.quoted_deposit_atomic),
    totalDue: TokenAmount.fromAtomicUnits(row.total_due_atomic),
    reputationTier: reputationTier(row.reputation_tier),
    expiresAt: toIsoTimestamp(row.expires_at),
    createdAt: toIsoTimestamp(row.created_at),
  };
}

export function mapBookingRequestRow(row: BookingRequestRow): BookingRequest {
  const approvalReason = row.approval_reason ?? undefined;

  return {
    id: row.id,
    holdId: row.hold_id,
    listingId: row.listing_id,
    guestProfileId: row.guest_profile_id,
    approvalResult: bookingRequestApprovalResult(row.approval_result),
    ...(approvalReason ? { approvalReason } : {}),
    policyVersion: row.policy_version,
    status: bookingRequestStatus(row.status),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export function mapListingRow(row: ListingRow): Listing {
  return {
    id: row.id,
    hostProfileId: row.host_profile_id,
    title: row.title,
    description: row.description,
    city: row.city,
    neighborhood: row.neighborhood,
    approximateLocationRef: row.approximate_location_ref,
    amenities: row.amenities,
    houseRules: row.house_rules,
    settlementTokenId: row.settlement_token_id,
    nightlyRate: TokenAmount.fromAtomicUnits(row.nightly_rate_atomic),
    baseDeposit: TokenAmount.fromAtomicUnits(row.base_deposit_atomic),
    maxGuests: row.max_guests,
    status: listingStatus(row.status),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export function mapReservationHoldRow(row: ReservationHoldRow): ReservationHold {
  return {
    id: row.id,
    listingId: row.listing_id,
    guestProfileId: row.guest_profile_id,
    quoteId: row.quote_id,
    stayRange: StayRange.fromStrings({
      checkIn: toLocalDate(row.check_in),
      checkOut: toLocalDate(row.check_out),
    }),
    status: holdStatus(row.status),
    expiresAt: toIsoTimestamp(row.expires_at),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export function mapBookingRow(row: BookingRow): Booking {
  return {
    id: row.id,
    listingId: row.listing_id,
    hostProfileId: row.host_profile_id,
    guestProfileId: row.guest_profile_id,
    quoteId: row.quote_id,
    holdId: row.hold_id,
    stayRange: StayRange.fromStrings({
      checkIn: toLocalDate(row.check_in),
      checkOut: toLocalDate(row.check_out),
    }),
    settlementTokenId: row.settlement_token_id,
    staySubtotal: TokenAmount.fromAtomicUnits(row.stay_subtotal_atomic),
    depositAmount: TokenAmount.fromAtomicUnits(row.deposit_amount_atomic),
    status: bookingStatus(row.status),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export function mapExternalOperationRow(row: ExternalOperationRow): ExternalOperation {
  if (
    row.operation_kind !== 'hedera_deposit' ||
    row.aggregate_type !== 'booking' ||
    row.provider !== 'hedera'
  ) {
    throw new Error(`Unsupported external Operation shape from database: ${row.id}`);
  }

  const providerTransactionId = row.provider_transaction_id ?? undefined;
  const providerResponse =
    row.provider_response === null
      ? undefined
      : scalarRecord(row.provider_response, 'provider_response');
  const failureCode = row.failure_code ?? undefined;
  const nextAttemptAt =
    row.next_attempt_at === null ? undefined : toIsoTimestamp(row.next_attempt_at);

  return {
    id: row.id,
    kind: row.operation_kind,
    idempotencyKey: row.idempotency_key,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    provider: row.provider,
    ...(providerTransactionId ? { providerTransactionId } : {}),
    status: externalOperationStatus(row.status),
    requestPayload: scalarRecord(row.request_payload, 'request_payload'),
    ...(providerResponse ? { providerResponse } : {}),
    ...(failureCode ? { failureCode } : {}),
    attemptCount: row.attempt_count,
    ...(nextAttemptAt ? { nextAttemptAt } : {}),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export function mapEscrowRow(row: EscrowRow): Escrow {
  const fundedTransactionId = row.funded_transaction_id ?? undefined;
  const releaseTransactionId = row.release_transaction_id ?? undefined;

  return {
    id: row.id,
    bookingId: row.booking_id,
    tokenId: row.token_id,
    amount: TokenAmount.fromAtomicUnits(row.amount_atomic),
    status: escrowStatus(row.status),
    ...(fundedTransactionId ? { fundedTransactionId } : {}),
    ...(releaseTransactionId ? { releaseTransactionId } : {}),
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}

export function mapPaymentRow(row: PaymentRow): Payment {
  if (row.payment_kind !== 'deposit') {
    throw new Error(`Unsupported Payment kind from database: ${row.payment_kind}`);
  }

  return {
    id: row.id,
    bookingId: row.booking_id,
    kind: row.payment_kind,
    tokenId: row.token_id,
    amount: TokenAmount.fromAtomicUnits(row.amount_atomic),
    recipientRef: row.recipient_ref,
    status: paymentStatus(row.status),
    operationId: row.operation_id,
    createdAt: toIsoTimestamp(row.created_at),
    updatedAt: toIsoTimestamp(row.updated_at),
  };
}
