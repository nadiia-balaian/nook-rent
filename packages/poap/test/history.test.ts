import { describe, expect, it, vi } from 'vitest';

import { PoapCompassHistoryReader, PoapHistoryProviderError } from '../src/history.js';

const walletAddress = '0x000000000000000000000000000000000000dEaD';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
    },
  });
}

describe('POAP Compass history reader', () => {
  it('reads and paginates public collection metadata without an API key', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            poaps: [
              {
                chain: 'gnosis',
                drop_id: 42,
                id: 100,
                minted_on: 1_752_580_800,
                transfer_count: 0,
                drop: {
                  image_url: 'https://assets.poap.xyz/example.png',
                  start_date: '2025-07-15',
                  name: 'ETHGlobal',
                },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: { poaps: [] } }));
    const reader = new PoapCompassHistoryReader({
      fetcher,
      pageSize: 1,
    });

    await expect(reader.listByAddress(walletAddress)).resolves.toEqual({
      source: 'poap_compass',
      truncated: false,
      items: [
        {
          tokenId: '100',
          eventId: '42',
          collectedAt: '2025-07-15T12:00:00.000Z',
          transferCount: 0,
          chain: 'gnosis',
          eventName: 'ETHGlobal',
          eventStartDate: '2025-07-15',
          imageUrl: 'https://assets.poap.xyz/example.png?size=small',
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]?.headers).not.toHaveProperty('x-api-key');
    expect(fetcher.mock.calls[0]?.[1]?.body).toEqual(
      expect.stringContaining(walletAddress.toLowerCase()),
    );
  });

  it('sends an optional provider key when one is configured', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        data: {
          poaps: [],
        },
      }),
    );
    const reader = new PoapCompassHistoryReader({
      apiKey: 'future-provider-key',
      fetcher,
    });

    await reader.listByAddress(walletAddress);

    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-api-key': 'future-provider-key',
    });
  });

  it('sanitizes provider failures', async () => {
    const reader = new PoapCompassHistoryReader({
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ secret: 'detail' }, 500)),
    });

    await expect(reader.listByAddress(walletAddress)).rejects.toEqual(
      new PoapHistoryProviderError(),
    );
  });
});
