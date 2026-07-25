import type { BookingStatus, ListingStatus, ReservationHoldStatus } from './entities.js';
import { InvalidStateTransitionError } from './errors.js';

const LISTING_TRANSITIONS: Record<ListingStatus, readonly ListingStatus[]> = {
  draft: ['published', 'archived'],
  published: ['paused', 'archived'],
  paused: ['published', 'archived'],
  archived: [],
};

const HOLD_TRANSITIONS: Record<ReservationHoldStatus, readonly ReservationHoldStatus[]> = {
  active: ['converted', 'released', 'expired'],
  converted: [],
  released: [],
  expired: [],
};

const BOOKING_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  request_received: ['approval_pending', 'awaiting_deposit', 'rejected', 'expired', 'cancelled'],
  approval_pending: ['awaiting_deposit', 'rejected', 'expired', 'cancelled'],
  awaiting_deposit: ['confirmed', 'expired', 'cancelled'],
  confirmed: ['checked_in', 'cancelled', 'disputed'],
  checked_in: ['checkout_pending', 'disputed'],
  checkout_pending: ['completed', 'disputed'],
  completed: [],
  rejected: [],
  expired: [],
  cancelled: [],
  disputed: ['completed', 'cancelled'],
};

function transition<T extends string>(
  entity: string,
  current: T,
  next: T,
  allowed: Record<T, readonly T[]>,
): T {
  if (!allowed[current].includes(next)) {
    throw new InvalidStateTransitionError(entity, current, next);
  }

  return next;
}

export function transitionListing(current: ListingStatus, next: ListingStatus): ListingStatus {
  return transition('Listing', current, next, LISTING_TRANSITIONS);
}

export function transitionReservationHold(
  current: ReservationHoldStatus,
  next: ReservationHoldStatus,
): ReservationHoldStatus {
  return transition('Reservation Hold', current, next, HOLD_TRANSITIONS);
}

export function transitionBooking(current: BookingStatus, next: BookingStatus): BookingStatus {
  return transition('Booking', current, next, BOOKING_TRANSITIONS);
}
