import { describe, expect, it } from 'vitest';

import {
  AgentPaymentMandateService,
  type AgentPaymentMandate,
  type AgentPaymentMandateRepositoryPort,
  type Booking,
  type ReservationHold,
  StayRange,
  TokenAmount,
} from '../src/index.js';

const now = '2026-07-26T10:00:00.000Z';

function booking(): Booking {
  return {
    id: 'booking-1',
    listingId: 'listing-1',
    hostProfileId: 'host-1',
    guestProfileId: 'guest-1',
    quoteId: 'quote-1',
    holdId: 'hold-1',
    stayRange: StayRange.fromStrings({
      checkIn: '2026-08-20',
      checkOut: '2026-08-25',
    }),
    settlementTokenId: '0.0.7001',
    staySubtotal: TokenAmount.fromAtomicUnits('50000'),
    depositAmount: TokenAmount.fromAtomicUnits('25000'),
    status: 'awaiting_deposit',
    createdAt: now,
    updatedAt: now,
  };
}

function hold(): ReservationHold {
  return {
    id: 'hold-1',
    listingId: 'listing-1',
    guestProfileId: 'guest-1',
    quoteId: 'quote-1',
    stayRange: StayRange.fromStrings({
      checkIn: '2026-08-20',
      checkOut: '2026-08-25',
    }),
    status: 'active',
    expiresAt: '2026-07-26T10:10:00.000Z',
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryMandates implements AgentPaymentMandateRepositoryPort {
  mandate?: AgentPaymentMandate;

  authorize(
    mandate: AgentPaymentMandate,
  ): Promise<{ status: 'created' | 'idempotent'; mandate: AgentPaymentMandate }> {
    if (this.mandate) {
      return Promise.resolve({ status: 'idempotent', mandate: this.mandate });
    }

    this.mandate = mandate;
    return Promise.resolve({ status: 'created', mandate });
  }

  getById(id: string): Promise<AgentPaymentMandate | undefined> {
    return Promise.resolve(this.mandate?.id === id ? this.mandate : undefined);
  }

  getByBookingId(bookingId: string): Promise<AgentPaymentMandate | undefined> {
    return Promise.resolve(this.mandate?.bookingId === bookingId ? this.mandate : undefined);
  }
}

function service(input?: { currentBooking?: Booking; currentHold?: ReservationHold }) {
  const mandates = new MemoryMandates();
  const instance = new AgentPaymentMandateService({
    bookings: {
      getById: () => Promise.resolve(input?.currentBooking ?? booking()),
      getByHoldId: () => Promise.resolve(input?.currentBooking ?? booking()),
      save: () => Promise.resolve(),
    },
    holds: {
      createActive: () => Promise.reject(new Error('unused')),
      expireActive: () => Promise.reject(new Error('unused')),
      getById: () => Promise.resolve(input?.currentHold ?? hold()),
      save: () => Promise.resolve(),
    },
    mandates,
    clock: { now: () => now },
    ids: { next: () => 'mandate-1' },
  });

  return { instance, mandates };
}

describe('AgentPaymentMandateService', () => {
  it('authorizes one bounded deposit and returns the same mandate on retry', async () => {
    const tracer = service();
    const input = {
      idempotencyKey: 'payment:secure-match-1',
      bookingId: 'booking-1',
      agentAddress: '0xABC',
      maximumDeposit: TokenAmount.fromAtomicUnits('30000'),
    };

    const created = await tracer.instance.authorize(input);
    const retry = await tracer.instance.authorize(input);

    expect(created.status).toBe('created');
    expect(created.mandate).toMatchObject({
      id: 'mandate-1',
      guestProfileId: 'guest-1',
      agentAddress: '0xabc',
      bookingId: 'booking-1',
      quoteId: 'quote-1',
      tokenId: '0.0.7001',
      status: 'active',
      expiresAt: '2026-07-26T10:10:00.000Z',
    });
    expect(created.mandate.maximumDeposit.toString()).toBe('30000');
    expect(retry).toEqual({
      status: 'idempotent',
      mandate: created.mandate,
    });
  });

  it('rejects a cap below the deterministic Booking deposit', async () => {
    const tracer = service();

    await expect(
      tracer.instance.authorize({
        idempotencyKey: 'payment:secure-match-2',
        bookingId: 'booking-1',
        agentAddress: '0xabc',
        maximumDeposit: TokenAmount.fromAtomicUnits('24999'),
      }),
    ).rejects.toMatchObject({
      conflict: 'agent_payment_cap_insufficient',
    });
    expect(tracer.mandates.mandate).toBeUndefined();
  });

  it('rejects authorization after the Reservation Hold expires', async () => {
    const tracer = service({
      currentHold: {
        ...hold(),
        expiresAt: now,
      },
    });

    await expect(
      tracer.instance.authorize({
        idempotencyKey: 'payment:secure-match-3',
        bookingId: 'booking-1',
        agentAddress: '0xabc',
        maximumDeposit: TokenAmount.fromAtomicUnits('25000'),
      }),
    ).rejects.toMatchObject({
      conflict: 'reservation_hold_not_active',
    });
  });
});
