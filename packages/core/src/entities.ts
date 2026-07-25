import type { StayRange } from './local-date.js';
import type { TokenAmount } from './token-amount.js';

export type MemberRole = 'host' | 'guest' | 'both';

export interface MemberProfile {
  id: string;
  role: MemberRole;
  publicRef: string;
  createdAt: string;
}

export type ListingStatus = 'draft' | 'published' | 'paused' | 'archived';

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
  nightlyRate: TokenAmount;
  maxGuests: number;
  status: ListingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AvailabilityWindow {
  id: string;
  listingId: string;
  stayRange: StayRange;
  createdAt: string;
}

export type RentalReputationTier = 'newcomer' | 'bronze' | 'silver' | 'gold';

export interface BookingQuote {
  id: string;
  listingId: string;
  guestProfileId: string;
  stayRange: StayRange;
  nightlyRate: TokenAmount;
  staySubtotal: TokenAmount;
  baseDeposit: TokenAmount;
  quotedDeposit: TokenAmount;
  totalDue: TokenAmount;
  reputationTier: RentalReputationTier;
  expiresAt: string;
  createdAt: string;
}

export type ReservationHoldStatus = 'active' | 'converted' | 'released' | 'expired';

export interface ReservationHold {
  id: string;
  listingId: string;
  guestProfileId: string;
  quoteId: string;
  stayRange: StayRange;
  status: ReservationHoldStatus;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export type BookingStatus =
  | 'request_received'
  | 'approval_pending'
  | 'awaiting_deposit'
  | 'confirmed'
  | 'checked_in'
  | 'checkout_pending'
  | 'completed'
  | 'rejected'
  | 'expired'
  | 'cancelled'
  | 'disputed';

export interface Booking {
  id: string;
  listingId: string;
  hostProfileId: string;
  guestProfileId: string;
  quoteId: string;
  holdId: string;
  stayRange: StayRange;
  staySubtotal: TokenAmount;
  depositAmount: TokenAmount;
  status: BookingStatus;
  createdAt: string;
  updatedAt: string;
}
