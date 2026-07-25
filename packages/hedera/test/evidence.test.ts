import { describe, expect, it } from 'vitest';

import { createEvidenceEnvelopeForTest } from '../src/evidence.js';

const input = {
  operationId: 'operation-1',
  submissionTransactionId: '0.0.1001@1784980800.000000001',
  eventId: 'deposit-funded:public-ref',
  eventType: 'booking.deposit.funded',
  occurredAt: '2026-07-25T12:00:00.000Z',
  subjectRef: 'public-ref',
  payload: {
    amountAtomic: '25000',
    depositTransactionId: '0.0.1001@1784980799.000000001',
    network: 'hedera-testnet',
    state: 'funded',
    tokenId: '0.0.7001',
  },
};

describe('HCS evidence envelope', () => {
  it('creates a versioned pseudonymous event', () => {
    expect(createEvidenceEnvelopeForTest(input)).toEqual({
      version: 1,
      eventId: input.eventId,
      type: input.eventType,
      occurredAt: input.occurredAt,
      subjectRef: input.subjectRef,
      payload: input.payload,
    });
  });

  it('rejects fields that could expose private identity or access data', () => {
    expect(() =>
      createEvidenceEnvelopeForTest({
        ...input,
        payload: {
          ...input.payload,
          worldNullifier: 'do-not-publish',
        },
      }),
    ).toThrow('forbidden private-data field');
  });
});
