import { describe, expect, it } from 'vitest';

import { summarizePoapCollection } from '../src/wallet-evidence.js';

describe('POAP collection evidence', () => {
  it('derives named signals without creating a trust or reputation score', () => {
    expect(
      summarizePoapCollection({
        source: 'poap_compass',
        truncated: false,
        items: [
          {
            tokenId: '1',
            eventId: 'event-a',
            collectedAt: '2024-05-01T10:00:00.000Z',
            transferCount: 0,
          },
          {
            tokenId: '2',
            eventId: 'event-b',
            collectedAt: '2026-07-25T10:00:00.000Z',
            transferCount: 2,
          },
          {
            tokenId: '3',
            eventId: 'event-b',
            collectedAt: '2026-07-24T10:00:00.000Z',
            transferCount: 1,
          },
        ],
      }),
    ).toEqual({
      totalPoaps: 3,
      distinctEvents: 2,
      activeYears: [2024, 2026],
      firstCollectedAt: '2024-05-01T10:00:00.000Z',
      latestCollectedAt: '2026-07-25T10:00:00.000Z',
      tokensWithRecordedTransfers: 2,
      totalRecordedTransfers: 3,
    });
  });
});
