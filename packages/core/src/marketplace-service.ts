import {
  evaluateApprovalPolicy,
  type ApprovalDecision,
  type ApprovalPolicy,
} from './approval-policy.js';
import { createBookingQuote } from './booking-quote.js';
import type {
  AvailabilityWindow,
  Booking,
  BookingQuote,
  BookingRequest,
  Listing,
  MemberProfile,
  MemberRole,
  ReservationHold,
} from './entities.js';
import { DomainConflictError, DomainValidationError, ResourceNotFoundError } from './errors.js';
import type { StayRange } from './local-date.js';
import type {
  AvailabilityWindowRepositoryPort,
  BookingQuoteRepositoryPort,
  BookingRepositoryPort,
  BookingRequestRepositoryPort,
  ClockPort,
  IdGeneratorPort,
  ListingApprovalPolicyRepositoryPort,
  ListingRepositoryPort,
  ListingSearch,
  MemberProfileRepositoryPort,
  RentalReputationPort,
  ReservationHoldRepositoryPort,
  StoredListingApprovalPolicy,
} from './ports.js';
import {
  transitionBooking,
  transitionListing,
  transitionReservationHold,
} from './state-machine.js';
import type { TokenAmount } from './token-amount.js';

const QUOTE_LIFETIME_MILLISECONDS = 15 * 60 * 1000;
const HOLD_LIFETIME_MILLISECONDS = 10 * 60 * 1000;

export interface MarketplaceServiceDependencies {
  profiles: MemberProfileRepositoryPort;
  listings: ListingRepositoryPort;
  availability: AvailabilityWindowRepositoryPort;
  approvalPolicies: ListingApprovalPolicyRepositoryPort;
  quotes: BookingQuoteRepositoryPort;
  holds: ReservationHoldRepositoryPort;
  bookingRequests: BookingRequestRepositoryPort;
  bookings: BookingRepositoryPort;
  reputation: RentalReputationPort;
  clock: ClockPort;
  ids: IdGeneratorPort;
}

export interface CreateListingDraftInput {
  hostProfileId: string;
  title: string;
  description: string;
  city: string;
  neighborhood: string;
  approximateLocationRef: string;
  amenities: string[];
  houseRules: string[];
  settlementTokenId: string;
  nightlyRate: TokenAmount;
  baseDeposit: TokenAmount;
  maxGuests: number;
  availability: StayRange[];
  approvalPolicy: ApprovalPolicy;
}

export interface ListingDetail {
  listing: Listing;
  availability: AvailabilityWindow[];
  approvalPolicy: StoredListingApprovalPolicy;
}

export type ReservationRequestResult =
  | { status: 'conflict' }
  | {
      status: 'created' | 'idempotent';
      hold: ReservationHold;
      bookingRequest: BookingRequest;
      booking: Booking;
      approval: ApprovalDecision;
    };

function requireNonEmpty(value: string, field: string): void {
  if (value.trim().length === 0) {
    throw new DomainValidationError(`${field} is required`);
  }
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  const parsed = Date.parse(timestamp);

  if (!Number.isFinite(parsed)) {
    throw new DomainValidationError('clock returned an invalid timestamp');
  }

  return new Date(parsed + milliseconds).toISOString();
}

function earliestTimestamp(first: string, second: string): string {
  return Date.parse(first) <= Date.parse(second) ? first : second;
}

function approvalFromRequest(request: BookingRequest): ApprovalDecision {
  if (request.approvalResult === 'auto_approved') {
    return { status: 'auto_approved' };
  }

  return {
    status: 'host_review',
    reason:
      request.approvalReason === 'automatic_approval_disabled'
        ? 'automatic_approval_disabled'
        : 'rental_reputation_below_minimum',
  };
}

export class MarketplaceService {
  constructor(private readonly dependencies: MarketplaceServiceDependencies) {}

  async createProfile(input: { role: MemberRole; publicRef: string }): Promise<MemberProfile> {
    requireNonEmpty(input.publicRef, 'publicRef');
    const profile: MemberProfile = {
      id: this.dependencies.ids.next('profile'),
      role: input.role,
      publicRef: input.publicRef.trim(),
      createdAt: this.dependencies.clock.now(),
    };

    await this.dependencies.profiles.save(profile);
    return profile;
  }

  async createListingDraft(input: CreateListingDraftInput): Promise<ListingDetail> {
    const host = await this.dependencies.profiles.getById(input.hostProfileId);

    if (!host) {
      throw new ResourceNotFoundError('Member Profile', input.hostProfileId);
    }

    if (host.role !== 'host' && host.role !== 'both') {
      throw new DomainValidationError('Listing owner must have the Host role');
    }

    requireNonEmpty(input.title, 'title');
    requireNonEmpty(input.description, 'description');
    requireNonEmpty(input.city, 'city');
    requireNonEmpty(input.approximateLocationRef, 'approximateLocationRef');
    requireNonEmpty(input.settlementTokenId, 'settlementTokenId');

    if (input.nightlyRate.isZero() || input.baseDeposit.isZero()) {
      throw new DomainValidationError('nightly rate and base deposit must be greater than zero');
    }

    if (!Number.isSafeInteger(input.maxGuests) || input.maxGuests < 1) {
      throw new DomainValidationError('maxGuests must be a positive integer');
    }

    if (input.availability.length === 0) {
      throw new DomainValidationError('at least one Availability Window is required');
    }

    const timestamp = this.dependencies.clock.now();
    const listingId = this.dependencies.ids.next('listing');
    const listing: Listing = {
      id: listingId,
      hostProfileId: input.hostProfileId,
      title: input.title.trim(),
      description: input.description.trim(),
      city: input.city.trim(),
      neighborhood: input.neighborhood.trim(),
      approximateLocationRef: input.approximateLocationRef.trim(),
      amenities: [...new Set(input.amenities.map((amenity) => amenity.trim()).filter(Boolean))],
      houseRules: [...new Set(input.houseRules.map((rule) => rule.trim()).filter(Boolean))],
      settlementTokenId: input.settlementTokenId.trim(),
      nightlyRate: input.nightlyRate,
      baseDeposit: input.baseDeposit,
      maxGuests: input.maxGuests,
      status: 'draft',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const availability = input.availability.map((stayRange): AvailabilityWindow => ({
      id: this.dependencies.ids.next('availability'),
      listingId,
      stayRange,
      createdAt: timestamp,
    }));
    const approvalPolicy: StoredListingApprovalPolicy = {
      listingId,
      policy: input.approvalPolicy,
      version: 1,
      updatedAt: timestamp,
    };

    await this.dependencies.listings.save(listing);
    await this.dependencies.availability.replaceForListing(listingId, availability);
    await this.dependencies.approvalPolicies.save(approvalPolicy);

    return { listing, availability, approvalPolicy };
  }

  async publishListing(listingId: string): Promise<ListingDetail> {
    const detail = await this.getListing(listingId);
    const updatedAt = this.dependencies.clock.now();
    const listing: Listing = {
      ...detail.listing,
      status: transitionListing(detail.listing.status, 'published'),
      updatedAt,
    };

    await this.dependencies.listings.save(listing);
    return { ...detail, listing };
  }

  async searchListings(input: ListingSearch): Promise<Listing[]> {
    return this.dependencies.listings.search(input);
  }

  async getListing(listingId: string): Promise<ListingDetail> {
    const listing = await this.dependencies.listings.getById(listingId);

    if (!listing) {
      throw new ResourceNotFoundError('Listing', listingId);
    }

    const [availability, approvalPolicy] = await Promise.all([
      this.dependencies.availability.listForListing(listingId),
      this.dependencies.approvalPolicies.getByListingId(listingId),
    ]);

    if (availability.length === 0 || !approvalPolicy) {
      throw new DomainConflictError(
        'incomplete_listing',
        `Listing is missing availability or an Approval Policy: ${listingId}`,
      );
    }

    return { listing, availability, approvalPolicy };
  }

  async createQuote(input: {
    listingId: string;
    guestProfileId: string;
    stayRange: StayRange;
  }): Promise<BookingQuote> {
    const [detail, guest, reputationTier] = await Promise.all([
      this.getListing(input.listingId),
      this.dependencies.profiles.getById(input.guestProfileId),
      this.dependencies.reputation.getTier(input.guestProfileId),
    ]);

    if (!guest) {
      throw new ResourceNotFoundError('Member Profile', input.guestProfileId);
    }

    if (guest.role !== 'guest' && guest.role !== 'both') {
      throw new DomainValidationError('Booking Quote owner must have the Guest role');
    }

    if (detail.listing.status !== 'published') {
      throw new DomainConflictError('listing_not_published', 'Listing is not published');
    }

    if (!detail.availability.some((window) => window.stayRange.contains(input.stayRange))) {
      throw new DomainConflictError(
        'outside_availability',
        'Requested dates are outside Listing availability',
      );
    }

    const createdAt = this.dependencies.clock.now();
    const quote = createBookingQuote({
      id: this.dependencies.ids.next('quote'),
      listingId: detail.listing.id,
      guestProfileId: input.guestProfileId,
      stayRange: input.stayRange,
      settlementTokenId: detail.listing.settlementTokenId,
      nightlyRate: detail.listing.nightlyRate,
      baseDeposit: detail.listing.baseDeposit,
      reputationTier,
      createdAt,
      expiresAt: addMilliseconds(createdAt, QUOTE_LIFETIME_MILLISECONDS),
    });

    await this.dependencies.quotes.save(quote);
    return quote;
  }

  async requestReservation(input: {
    requestId: string;
    quoteId: string;
  }): Promise<ReservationRequestResult> {
    const quote = await this.dependencies.quotes.getById(input.quoteId);

    if (!quote) {
      throw new ResourceNotFoundError('Booking Quote', input.quoteId);
    }

    const now = this.dependencies.clock.now();
    const holdResult = await this.dependencies.holds.createActive({
      requestId: input.requestId,
      listingId: quote.listingId,
      guestProfileId: quote.guestProfileId,
      quoteId: quote.id,
      stayRange: quote.stayRange,
      expiresAt: earliestTimestamp(
        quote.expiresAt,
        addMilliseconds(now, HOLD_LIFETIME_MILLISECONDS),
      ),
      now,
    });

    if (holdResult.status === 'conflict') {
      return { status: 'conflict' };
    }

    const [existingRequest, existingBooking] = await Promise.all([
      this.dependencies.bookingRequests.getByHoldId(holdResult.hold.id),
      this.dependencies.bookings.getByHoldId(holdResult.hold.id),
    ]);

    if (existingRequest && existingBooking) {
      return {
        status: 'idempotent',
        hold: holdResult.hold,
        bookingRequest: existingRequest,
        booking: existingBooking,
        approval: approvalFromRequest(existingRequest),
      };
    }

    const [detail, reputationTier] = await Promise.all([
      this.getListing(quote.listingId),
      this.dependencies.reputation.getTier(quote.guestProfileId),
    ]);
    const approval = evaluateApprovalPolicy({
      policy: detail.approvalPolicy.policy,
      guestReputationTier: reputationTier,
    });
    const bookingRequest =
      existingRequest ??
      this.createBookingRequest({
        hold: holdResult.hold,
        approval,
        policyVersion: detail.approvalPolicy.version,
        now,
      });
    const booking =
      existingBooking ??
      this.createBooking({
        listing: detail.listing,
        quote,
        hold: holdResult.hold,
        approval,
        now,
      });

    if (!existingRequest) {
      await this.dependencies.bookingRequests.save(bookingRequest);
    }
    if (!existingBooking) {
      await this.dependencies.bookings.save(booking);
    }

    return {
      status: holdResult.status,
      hold: holdResult.hold,
      bookingRequest,
      booking,
      approval,
    };
  }

  async decideBookingRequest(input: {
    requestId: string;
    hostProfileId: string;
    decision: 'approved' | 'rejected';
  }): Promise<{ bookingRequest: BookingRequest; booking: Booking; hold: ReservationHold }> {
    const request = await this.dependencies.bookingRequests.getById(input.requestId);

    if (!request) {
      throw new ResourceNotFoundError('Booking Request', input.requestId);
    }

    const [listing, booking, hold] = await Promise.all([
      this.dependencies.listings.getById(request.listingId),
      this.dependencies.bookings.getByHoldId(request.holdId),
      this.dependencies.holds.getById(request.holdId),
    ]);

    if (!listing || !booking || !hold) {
      throw new DomainConflictError(
        'incomplete_booking_request',
        'Booking Request is missing its Listing, Booking, or Reservation Hold',
      );
    }

    if (listing.hostProfileId !== input.hostProfileId) {
      throw new DomainValidationError('Only the Listing Host can decide this request');
    }

    if (request.status !== 'pending' || booking.status !== 'approval_pending') {
      throw new DomainConflictError(
        'booking_request_already_decided',
        'Booking Request is not pending Host review',
      );
    }

    const now = this.dependencies.clock.now();
    const bookingRequest: BookingRequest = {
      ...request,
      approvalResult: input.decision,
      status: input.decision === 'approved' ? 'approved' : 'rejected',
      updatedAt: now,
    };
    const updatedBooking: Booking = {
      ...booking,
      status: transitionBooking(
        booking.status,
        input.decision === 'approved' ? 'awaiting_deposit' : 'rejected',
      ),
      updatedAt: now,
    };
    const updatedHold: ReservationHold =
      input.decision === 'rejected'
        ? {
            ...hold,
            status: transitionReservationHold(hold.status, 'released'),
            updatedAt: now,
          }
        : hold;

    await this.dependencies.bookingRequests.save(bookingRequest);
    await this.dependencies.bookings.save(updatedBooking);
    if (updatedHold !== hold) {
      await this.dependencies.holds.save(updatedHold);
    }

    return {
      bookingRequest,
      booking: updatedBooking,
      hold: updatedHold,
    };
  }

  async getBooking(bookingId: string): Promise<Booking> {
    const booking = await this.dependencies.bookings.getById(bookingId);

    if (!booking) {
      throw new ResourceNotFoundError('Booking', bookingId);
    }

    return booking;
  }

  private createBookingRequest(input: {
    hold: ReservationHold;
    approval: ApprovalDecision;
    policyVersion: number;
    now: string;
  }): BookingRequest {
    const approvalReason =
      input.approval.status === 'host_review' ? input.approval.reason : undefined;

    return {
      id: this.dependencies.ids.next('booking_request'),
      holdId: input.hold.id,
      listingId: input.hold.listingId,
      guestProfileId: input.hold.guestProfileId,
      approvalResult: input.approval.status,
      ...(approvalReason ? { approvalReason } : {}),
      policyVersion: input.policyVersion,
      status: input.approval.status === 'auto_approved' ? 'approved' : 'pending',
      createdAt: input.now,
      updatedAt: input.now,
    };
  }

  private createBooking(input: {
    listing: Listing;
    quote: BookingQuote;
    hold: ReservationHold;
    approval: ApprovalDecision;
    now: string;
  }): Booking {
    return {
      id: this.dependencies.ids.next('booking'),
      listingId: input.listing.id,
      hostProfileId: input.listing.hostProfileId,
      guestProfileId: input.quote.guestProfileId,
      quoteId: input.quote.id,
      holdId: input.hold.id,
      stayRange: input.quote.stayRange,
      settlementTokenId: input.quote.settlementTokenId,
      staySubtotal: input.quote.staySubtotal,
      depositAmount: input.quote.quotedDeposit,
      status: input.approval.status === 'auto_approved' ? 'awaiting_deposit' : 'approval_pending',
      createdAt: input.now,
      updatedAt: input.now,
    };
  }
}
