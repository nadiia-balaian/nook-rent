import { describe, expect, it } from 'vitest';

import {
  InvalidStateTransitionError,
  transitionBooking,
  transitionListing,
  transitionReservationHold,
} from '../src/index.js';

describe('state machines', () => {
  it('supports the successful Booking lifecycle', () => {
    expect(transitionBooking('request_received', 'awaiting_deposit')).toBe('awaiting_deposit');
    expect(transitionBooking('awaiting_deposit', 'confirmed')).toBe('confirmed');
    expect(transitionBooking('confirmed', 'checked_in')).toBe('checked_in');
    expect(transitionBooking('checked_in', 'checkout_pending')).toBe('checkout_pending');
    expect(transitionBooking('checkout_pending', 'completed')).toBe('completed');
  });

  it('prevents reopening terminal states', () => {
    expect(() => transitionBooking('completed', 'confirmed')).toThrow(InvalidStateTransitionError);
    expect(() => transitionReservationHold('expired', 'active')).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => transitionListing('archived', 'published')).toThrow(InvalidStateTransitionError);
  });
});
