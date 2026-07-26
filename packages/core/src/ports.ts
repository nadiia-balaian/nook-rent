import type { ApprovalPolicy } from './approval-policy.js';
import type {
  AgentPaymentMandate,
  AvailabilityWindow,
  Booking,
  BookingQuote,
  BookingRequest,
  Escrow,
  ExternalOperation,
  Listing,
  MemberProfile,
  Payment,
  ReservationHold,
  RentalReputationTier,
} from './entities.js';
import type { StayRange } from './local-date.js';
import type { TokenAmount } from './token-amount.js';

export interface ClockPort {
  now(): string;
}

export interface IdGeneratorPort {
  next(prefix: string): string;
}

export interface ListingSearch {
  city: string;
  stayRange: StayRange;
  maximumNightlyRate?: TokenAmount;
  guests: number;
  requiredAmenities: string[];
}

export interface ListingRepositoryPort {
  getById(id: string): Promise<Listing | undefined>;
  save(listing: Listing): Promise<void>;
  search(input: ListingSearch): Promise<Listing[]>;
}

export interface MemberProfileRepositoryPort {
  getById(id: string): Promise<MemberProfile | undefined>;
  save(profile: MemberProfile): Promise<void>;
}

export interface AvailabilityWindowRepositoryPort {
  listForListing(listingId: string): Promise<AvailabilityWindow[]>;
  replaceForListing(listingId: string, windows: AvailabilityWindow[]): Promise<void>;
}

export interface BookingQuoteRepositoryPort {
  getById(id: string): Promise<BookingQuote | undefined>;
  save(quote: BookingQuote): Promise<void>;
}

export interface StoredListingApprovalPolicy {
  listingId: string;
  policy: ApprovalPolicy;
  version: number;
  updatedAt: string;
}

export interface ListingApprovalPolicyRepositoryPort {
  getByListingId(listingId: string): Promise<StoredListingApprovalPolicy | undefined>;
  save(policy: StoredListingApprovalPolicy): Promise<void>;
}

export interface CreateReservationHoldInput {
  requestId: string;
  listingId: string;
  guestProfileId: string;
  quoteId: string;
  stayRange: StayRange;
  expiresAt: string;
  now: string;
  authorization: HumanBackedAuthorization;
}

export type CreateReservationHoldResult =
  | { status: 'created'; hold: ReservationHold }
  | { status: 'idempotent'; hold: ReservationHold }
  | { status: 'conflict' };

export interface ReservationHoldRepositoryPort {
  createActive(input: CreateReservationHoldInput): Promise<CreateReservationHoldResult>;
  expireActive(input: { now: string; limit: number }): Promise<ReservationHold[]>;
  getById(id: string): Promise<ReservationHold | undefined>;
  save(hold: ReservationHold): Promise<void>;
}

export interface BookingRepositoryPort {
  getById(id: string): Promise<Booking | undefined>;
  getByHoldId(holdId: string): Promise<Booking | undefined>;
  save(booking: Booking): Promise<void>;
}

export interface BookingRequestRepositoryPort {
  getByHoldId(holdId: string): Promise<BookingRequest | undefined>;
  getById(id: string): Promise<BookingRequest | undefined>;
  save(request: BookingRequest): Promise<void>;
}

export interface AgentPaymentMandateRepositoryPort {
  authorize(
    mandate: AgentPaymentMandate,
  ): Promise<{ status: 'created' | 'idempotent'; mandate: AgentPaymentMandate }>;
  getById(id: string): Promise<AgentPaymentMandate | undefined>;
  getByBookingId(bookingId: string): Promise<AgentPaymentMandate | undefined>;
}

export interface HumanBackedAuthorization {
  provider: 'world_agentkit';
  agentAddress: string;
  anonymousHumanRefHash: string;
  nonce: string;
}

export interface HumanBackedAuthorizationPort {
  verify(input: { header: string; resourceUri: string }): Promise<HumanBackedAuthorization>;
}

export interface AgentRegistrationSignal {
  active: boolean;
  agentAddress: string;
  operatorAddresses: string[];
  capabilities: string[];
  sourceRef: string;
  chainId: number;
  subgraphId: string;
  network: string;
  binding: 'agent_wallet' | 'operator' | 'owner';
}

export interface OnchainSignalPort {
  getAgentRegistration(agentAddress: string): Promise<AgentRegistrationSignal | undefined>;
}

export interface ListingDraftInput {
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
}

export interface ListingDraft {
  title: string;
  description: string;
  suggestedAmenities: string[];
  inferredFields: Array<'description' | 'suggestedAmenities' | 'title'>;
}

export interface AgentExecution {
  provider: 'deterministic' | 'openai';
  mode: 'fallback' | 'live';
  model?: string;
  fallbackReason?: 'invalid_output' | 'provider_unavailable' | 'provider_error';
}

export interface AgentResult<T> {
  value: T;
  execution: AgentExecution;
}

export interface ListingDraftPort {
  createDraft(input: ListingDraftInput): Promise<AgentResult<ListingDraft>>;
}

export type GuestSearchInterpretation =
  | {
      status: 'needs_clarification';
      question: string;
    }
  | {
      status: 'ready';
      city: string;
      checkIn: string;
      checkOut: string;
      guests: number;
      maximumNightlyRateAtomic?: string;
      requiredAmenities: string[];
    };

export interface GuestSearchIntentPort {
  interpretSearch(input: { query: string }): Promise<AgentResult<GuestSearchInterpretation>>;
}

export interface ListingRankCandidate {
  id: string;
  title: string;
  city: string;
  neighborhood: string;
  amenities: string[];
  nightlyRateAtomic: string;
  maxGuests: number;
}

export interface ListingRecommendation {
  listingId: string;
  summary: string;
  matchReasons: string[];
}

export interface ListingRankingPort {
  rankListings(input: {
    query: string;
    interpretation: Extract<GuestSearchInterpretation, { status: 'ready' }>;
    candidates: ListingRankCandidate[];
  }): Promise<AgentResult<ListingRecommendation[]>>;
}

export interface DepositSubmission {
  transactionId: string;
  scheduleId?: string;
}

export interface FinancialLedgerPort {
  reserveTransactionId(operationId: string): Promise<string>;
  submitDeposit(input: {
    operationId: string;
    submissionTransactionId: string;
    bookingId: string;
    tokenId: string;
    amount: TokenAmount;
  }): Promise<DepositSubmission>;
  getTransactionStatus(
    transactionId: string,
  ): Promise<'pending' | 'confirmed' | 'failed' | 'unknown'>;
}

export interface DepositOperationSnapshot {
  operation: ExternalOperation;
  booking: Booking;
  hold: ReservationHold;
  escrow: Escrow;
  payment: Payment;
}

export interface PrepareDepositOperationInput {
  operationId: string;
  escrowId: string;
  paymentId: string;
  idempotencyKey: string;
  booking: Booking;
  escrowRecipientRef: string;
  publicEvidenceRef: string;
  agentPaymentMandateId?: string;
  now: string;
}

export interface DepositOperationRepositoryPort {
  prepare(input: PrepareDepositOperationInput): Promise<DepositOperationSnapshot>;
  getById(operationId: string): Promise<DepositOperationSnapshot | undefined>;
  saveOperation(operation: ExternalOperation): Promise<DepositOperationSnapshot>;
  confirmDeposit(input: {
    operationId: string;
    transactionId: string;
    providerResponse: Record<string, string | number | boolean | null>;
    now: string;
  }): Promise<DepositOperationSnapshot>;
  failDeposit(input: {
    operationId: string;
    failureCode: string;
    providerResponse: Record<string, string | number | boolean | null>;
    now: string;
  }): Promise<DepositOperationSnapshot>;
}

export interface RentalReputationPort {
  getTier(profileId: string): Promise<RentalReputationTier>;
}

export interface RentalEvidencePort {
  reserveTransactionId(operationId: string): Promise<string>;
  publish(input: {
    operationId: string;
    submissionTransactionId: string;
    eventId: string;
    eventType: string;
    occurredAt: string;
    subjectRef: string;
    payload: Record<string, string | number | boolean>;
  }): Promise<{
    transactionId: string;
    sequenceNumber: number;
  }>;
}
