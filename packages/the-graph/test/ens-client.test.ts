import { OnchainSignalProviderError } from '@nook-rent/core';
import { describe, expect, it, vi } from 'vitest';

import { EnsGraphClient } from '../src/ens-client.js';
import { ETHEREUM_MAINNET_ENS_SUBGRAPH_ID } from '../src/environment.js';

const API_KEY = 'graph-secret-test-key';
const WALLET_ADDRESS = '0xA508C16666C5B8981fA46eB32784fCCC01942a71';

function client(fetchImplementation: typeof fetch) {
  return new EnsGraphClient({
    apiKey: API_KEY,
    subgraphId: ETHEREUM_MAINNET_ENS_SUBGRAPH_ID,
    fetch: fetchImplementation,
    maxNames: 3,
    timeoutMs: 20,
  });
}

describe('ENS Graph client', () => {
  it('prefers readable wrapped names over unnormalized label hashes', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({
          data: {
            domains: [
              {
                name: `[${'4d7bd8ea86ef2defbc1fe4a8d1dd60bb7c485d7f8fa0f20df5022a9423185612'}].eth`,
              },
            ],
            wrappedDomains: [{ name: 'nadiia.eth' }],
          },
        }),
      ),
    );

    const signal = await client(fetchImplementation).listOwnedNames(WALLET_ADDRESS);

    expect(signal.ownedNames).toEqual(['nadiia.eth']);
    expect(fetchImplementation.mock.calls[0]?.[1]?.body).toContain('wrappedDomains');
  });

  it('returns owned ENS names from the official mainnet subgraph', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({
          data: {
            domains: [
              { name: 'datanexus.eth' },
              { name: 'server.datanexus.eth' },
              { name: 'datanexus.radicle.eth' },
              { name: 'fourth-name.eth' },
            ],
          },
        }),
      ),
    );

    await expect(client(fetchImplementation).listOwnedNames(WALLET_ADDRESS)).resolves.toEqual({
      provider: 'the_graph',
      dataset: 'ens',
      network: 'ethereum',
      subgraphId: ETHEREUM_MAINNET_ENS_SUBGRAPH_ID,
      sourceRef: `the-graph:ens:ethereum:${ETHEREUM_MAINNET_ENS_SUBGRAPH_ID}`,
      ownedNames: ['datanexus.eth', 'server.datanexus.eth', 'datanexus.radicle.eth'],
      truncated: true,
    });

    const [url, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toContain(API_KEY);
    expect(request?.body).toContain('"owner":"0xa508c16666c5b8981fa46eb32784fccc01942a71"');
  });

  it('returns a valid empty signal when the wallet owns no indexed ENS names', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ data: { domains: [] } })),
    );

    const signal = await client(fetchImplementation).listOwnedNames(WALLET_ADDRESS);

    expect(signal.ownedNames).toEqual([]);
    expect(signal.truncated).toBe(false);
  });

  it('normalizes malformed Graph responses without leaking provider details', async () => {
    const fetchImplementation = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        Response.json({
          errors: [{ message: `unauthorized API key ${API_KEY}` }],
        }),
      ),
    );

    await expect(client(fetchImplementation).listOwnedNames(WALLET_ADDRESS)).rejects.toEqual(
      new OnchainSignalProviderError(
        'invalid_provider_response',
        'The Graph gateway response did not match the ENS schema',
      ),
    );
  });
});
