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
  StoredListingApprovalPolicy,
} from '@nook-rent/core';

import type { PostgresClient } from './client.js';
import {
  type AvailabilityWindowRow,
  type BookingRow,
  type BookingQuoteRow,
  type BookingRequestRow,
  type ListingRow,
  mapAvailabilityWindowRow,
  mapBookingRow,
  mapBookingQuoteRow,
  mapBookingRequestRow,
  mapListingRow,
  mapMemberProfileRow,
  mapReservationHoldRow,
  type MemberProfileRow,
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
    const [row] = await this.sql<CreateHoldRow[]>`
      select *
      from nook.create_reservation_hold(
        ${input.requestId},
        ${input.listingId}::uuid,
        ${input.guestProfileId}::uuid,
        ${input.quoteId}::uuid,
        ${input.stayRange.checkIn.toString()}::date,
        ${input.stayRange.checkOut.toString()}::date,
        ${input.expiresAt}::timestamptz,
        ${input.now}::timestamptz
      )
    `;

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
