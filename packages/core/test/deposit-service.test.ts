import { describe, expect, it } from 'vitest';

import {
  BookingDepositService,
  type Booking,
  type DepositOperationRepositoryPort,
  type DepositOperationSnapshot,
  type FinancialLedgerPort,
  type PrepareDepositOperationInput,
  type RentalEvidencePort,
  type ReservationHold,
  StayRange,
  TokenAmount,
} from '../src/index.js';

const now = '2026-07-25T12:00:00.000Z';

function booking(status: Booking['status'] = 'awaiting_deposit'): Booking {
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
    status,
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
    expiresAt: '2026-07-25T12:15:00.000Z',
    createdAt: now,
    updatedAt: now,
  };
}

class MemoryDepositOperations implements DepositOperationRepositoryPort {
  snapshot?: DepositOperationSnapshot;

  prepare(input: PrepareDepositOperationInput): Promise<DepositOperationSnapshot> {
    if (this.snapshot) {
      return Promise.resolve(this.snapshot);
    }

    this.snapshot = {
      operation: {
        id: input.operationId,
        kind: 'hedera_deposit',
        idempotencyKey: input.idempotencyKey,
        aggregateType: 'booking',
        aggregateId: input.booking.id,
        provider: 'hedera',
        status: 'pending',
        requestPayload: {
          amountAtomic: input.booking.depositAmount.toString(),
          bookingId: input.booking.id,
          escrowRecipientRef: input.escrowRecipientRef,
          publicEvidenceRef: input.publicEvidenceRef,
          tokenId: input.booking.settlementTokenId,
          version: 1,
        },
        attemptCount: 0,
        createdAt: input.now,
        updatedAt: input.now,
      },
      booking: input.booking,
      hold: hold(),
      escrow: {
        id: input.escrowId,
        bookingId: input.booking.id,
        tokenId: input.booking.settlementTokenId,
        amount: input.booking.depositAmount,
        status: 'pending',
        createdAt: input.now,
        updatedAt: input.now,
      },
      payment: {
        id: input.paymentId,
        bookingId: input.booking.id,
        kind: 'deposit',
        tokenId: input.booking.settlementTokenId,
        amount: input.booking.depositAmount,
        recipientRef: input.escrowRecipientRef,
        status: 'pending',
        operationId: input.operationId,
        createdAt: input.now,
        updatedAt: input.now,
      },
    };

    return Promise.resolve(this.snapshot);
  }

  getById(operationId: string): Promise<DepositOperationSnapshot | undefined> {
    return Promise.resolve(this.snapshot?.operation.id === operationId ? this.snapshot : undefined);
  }

  saveOperation(
    operation: DepositOperationSnapshot['operation'],
  ): Promise<DepositOperationSnapshot> {
    if (!this.snapshot) throw new Error('missing snapshot');
    this.snapshot = { ...this.snapshot, operation };
    return Promise.resolve(this.snapshot);
  }

  confirmDeposit(input: {
    operationId: string;
    transactionId: string;
    providerResponse: Record<string, string | number | boolean | null>;
    now: string;
  }): Promise<DepositOperationSnapshot> {
    if (!this.snapshot || this.snapshot.operation.id !== input.operationId) {
      throw new Error('missing snapshot');
    }

    this.snapshot = {
      operation: {
        ...this.snapshot.operation,
        status: 'confirmed',
        providerResponse: input.providerResponse,
        updatedAt: input.now,
      },
      booking: {
        ...this.snapshot.booking,
        status: 'confirmed',
        updatedAt: input.now,
      },
      hold: {
        ...this.snapshot.hold,
        status: 'converted',
        updatedAt: input.now,
      },
      escrow: {
        ...this.snapshot.escrow,
        status: 'funded',
        fundedTransactionId: input.transactionId,
        updatedAt: input.now,
      },
      payment: {
        ...this.snapshot.payment,
        status: 'confirmed',
        updatedAt: input.now,
      },
    };
    return Promise.resolve(this.snapshot);
  }

  failDeposit(input: {
    operationId: string;
    failureCode: string;
    providerResponse: Record<string, string | number | boolean | null>;
    now: string;
  }): Promise<DepositOperationSnapshot> {
    if (!this.snapshot || this.snapshot.operation.id !== input.operationId) {
      throw new Error('missing snapshot');
    }

    this.snapshot = {
      operation: {
        ...this.snapshot.operation,
        status: 'failed',
        failureCode: input.failureCode,
        providerResponse: input.providerResponse,
        updatedAt: input.now,
      },
      booking: { ...this.snapshot.booking, status: 'expired', updatedAt: input.now },
      hold: { ...this.snapshot.hold, status: 'released', updatedAt: input.now },
      escrow: { ...this.snapshot.escrow, status: 'failed', updatedAt: input.now },
      payment: { ...this.snapshot.payment, status: 'failed', updatedAt: input.now },
    };
    return Promise.resolve(this.snapshot);
  }
}

class FakeLedger implements FinancialLedgerPort {
  submissionCount = 0;
  transactionStatus: Awaited<ReturnType<FinancialLedgerPort['getTransactionStatus']>> = 'confirmed';
  throwOnSubmit = false;

  reserveTransactionId(): Promise<string> {
    return Promise.resolve('0.0.1001@1784980800.000000001');
  }

  submitDeposit(): Promise<{ transactionId: string }> {
    this.submissionCount += 1;

    if (this.throwOnSubmit) {
      return Promise.reject(new Error('simulated timeout'));
    }

    return Promise.resolve({ transactionId: '0.0.1001@1784980800.000000001' });
  }

  getTransactionStatus() {
    return Promise.resolve(this.transactionStatus);
  }
}

class FakeEvidence implements RentalEvidencePort {
  publicationCount = 0;

  reserveTransactionId(): Promise<string> {
    return Promise.resolve('0.0.1001@1784980801.000000001');
  }

  publish(): Promise<{ transactionId: string; sequenceNumber: number }> {
    this.publicationCount += 1;
    return Promise.resolve({
      transactionId: '0.0.1001@1784980801.000000001',
      sequenceNumber: 14,
    });
  }
}

function service(input?: { ledger?: FakeLedger; operations?: MemoryDepositOperations }) {
  const operations = input?.operations ?? new MemoryDepositOperations();
  const ledger = input?.ledger ?? new FakeLedger();
  const evidence = new FakeEvidence();
  let id = 0;
  const instance = new BookingDepositService({
    bookings: {
      getById: () => Promise.resolve(booking()),
      getByHoldId: () => Promise.resolve(booking()),
      save: () => Promise.resolve(undefined),
    },
    operations,
    ledger,
    evidence,
    clock: { now: () => now },
    ids: { next: (prefix) => `${prefix}-${(id += 1)}` },
    escrowRecipientRef: '0.0.2002',
  });

  return { instance, operations, ledger, evidence };
}

describe('BookingDepositService', () => {
  it('confirms a stored deposit through Mirror status and publishes HCS evidence', async () => {
    const tracer = service();

    const result = await tracer.instance.fundDeposit({
      bookingId: 'booking-1',
      idempotencyKey: 'deposit-request-1',
    });

    expect(result.snapshot.operation.status).toBe('confirmed');
    expect(result.snapshot.booking.status).toBe('confirmed');
    expect(result.snapshot.hold.status).toBe('converted');
    expect(result.snapshot.escrow.status).toBe('funded');
    expect(result.evidence).toEqual({
      status: 'confirmed',
      transactionId: '0.0.1001@1784980801.000000001',
      sequenceNumber: 14,
    });
    expect(tracer.ledger.submissionCount).toBe(1);
    expect(tracer.evidence.publicationCount).toBe(1);

    const retry = await tracer.instance.fundDeposit({
      bookingId: 'booking-1',
      idempotencyKey: 'deposit-request-1',
    });

    expect(retry.idempotent).toBe(true);
    expect(tracer.ledger.submissionCount).toBe(1);
    expect(tracer.evidence.publicationCount).toBe(1);
  });

  it('reconciles an unknown submission without resubmitting the transfer', async () => {
    const ledger = new FakeLedger();
    ledger.throwOnSubmit = true;
    ledger.transactionStatus = 'pending';
    const tracer = service({ ledger });

    const pending = await tracer.instance.fundDeposit({
      bookingId: 'booking-1',
      idempotencyKey: 'deposit-request-2',
    });

    expect(pending.snapshot.operation.status).toBe('reconciling');
    expect(pending.snapshot.operation.providerTransactionId).toBe('0.0.1001@1784980800.000000001');

    ledger.transactionStatus = 'confirmed';
    const reconciled = await tracer.instance.reconcileDeposit(pending.snapshot.operation.id);

    expect(reconciled.snapshot.operation.status).toBe('confirmed');
    expect(ledger.submissionCount).toBe(1);
  });

  it('releases the hold when Mirror Node confirms a failed transaction', async () => {
    const ledger = new FakeLedger();
    ledger.transactionStatus = 'failed';
    const tracer = service({ ledger });

    const result = await tracer.instance.fundDeposit({
      bookingId: 'booking-1',
      idempotencyKey: 'deposit-request-3',
    });

    expect(result.snapshot.operation.status).toBe('failed');
    expect(result.snapshot.booking.status).toBe('expired');
    expect(result.snapshot.hold.status).toBe('released');
    expect(result.snapshot.escrow.status).toBe('failed');
  });
});
