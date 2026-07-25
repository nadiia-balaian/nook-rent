import { describe, expect, it } from 'vitest';

import { createBookingQuote, StayRange, TokenAmount } from '../src/index.js';

describe('createBookingQuote', () => {
  it('calculates a nightly subtotal and reputation-adjusted deposit exactly', () => {
    const quote = createBookingQuote({
      id: 'quote:lisbon:1',
      listingId: 'listing:lisbon:1',
      guestProfileId: 'profile:guest:1',
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-05',
        checkOut: '2026-08-20',
      }),
      nightlyRate: TokenAmount.fromAtomicUnits('9500'),
      baseDeposit: TokenAmount.fromAtomicUnits('50000'),
      reputationTier: 'silver',
      createdAt: '2026-07-25T10:00:00.000Z',
      expiresAt: '2026-07-25T10:15:00.000Z',
    });

    expect(quote.stayRange.nights).toBe(15);
    expect(quote.staySubtotal.toString()).toBe('142500');
    expect(quote.quotedDeposit.toString()).toBe('50000');
    expect(quote.totalDue.toString()).toBe('192500');
  });

  it('charges a higher deposit to a Newcomer without treating them as ineligible', () => {
    const quote = createBookingQuote({
      id: 'quote:lisbon:newcomer',
      listingId: 'listing:lisbon:1',
      guestProfileId: 'profile:guest:newcomer',
      stayRange: StayRange.fromStrings({
        checkIn: '2026-08-05',
        checkOut: '2026-08-10',
      }),
      nightlyRate: TokenAmount.fromAtomicUnits('10000'),
      baseDeposit: TokenAmount.fromAtomicUnits('50000'),
      reputationTier: 'newcomer',
      createdAt: '2026-07-25T10:00:00.000Z',
      expiresAt: '2026-07-25T10:15:00.000Z',
    });

    expect(quote.quotedDeposit.toString()).toBe('75000');
  });
});
