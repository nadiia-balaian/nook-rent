import type { ApprovalPolicy } from './approval-policy.js';
import type {
  AvailabilityWindow,
  Booking,
  BookingQuote,
  BookingRequest,
  Listing,
  MemberProfile,
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

export interface HumanBackedAuthorization {
  verified: boolean;
  anonymousHumanRef?: string;
}

export interface HumanBackedAuthorizationPort {
  verify(input: {
    agentAddress: string;
    signedRequest: string;
    nonce: string;
  }): Promise<HumanBackedAuthorization>;
}

export interface AgentRegistrationSignal {
  active: boolean;
  agentAddress: string;
  operatorAddresses: string[];
  capabilities: string[];
  sourceRef: string;
}

export interface OnchainSignalPort {
  getAgentRegistration(agentAddress: string): Promise<AgentRegistrationSignal | undefined>;
}

export interface ListingDraftInput {
  hostFacts: Record<string, string | number | boolean | string[]>;
  imageRefs: string[];
}

export interface ListingDraft {
  title: string;
  description: string;
  suggestedAmenities: string[];
  inferredFields: string[];
}

export interface ListingDraftPort {
  createDraft(input: ListingDraftInput): Promise<ListingDraft>;
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

export interface RentalReputationPort {
  getTier(profileId: string): Promise<RentalReputationTier>;
}

export interface RentalEvidencePort {
  publish(input: {
    operationId: string;
    eventId: string;
    eventType: string;
    subjectRef: string;
    payload: Record<string, string | number | boolean>;
  }): Promise<{
    transactionId: string;
    sequenceNumber: number;
  }>;
}
