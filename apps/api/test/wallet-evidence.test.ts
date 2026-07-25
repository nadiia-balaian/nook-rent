import type { EnsNameReaderPort, PoapCollectionReaderPort } from '@nook-rent/core';
import type { VerifiedWalletControl, WalletChallenge } from '@nook-rent/poap';
import { describe, expect, it, vi } from 'vitest';

import { WalletEvidenceService } from '../src/wallet-evidence.js';

const ADDRESS = '0x1111111111111111111111111111111111111111';

describe('Wallet evidence service', () => {
  it('returns independently named POAP and The Graph ENS signals after wallet proof', async () => {
    const challenge: WalletChallenge = {
      address: ADDRESS,
      issuedAt: '2026-07-26T00:00:00.000Z',
      expiresAt: '2026-07-26T00:05:00.000Z',
      nonce: 'test-nonce',
      message: 'Nook.rent wallet evidence',
      integrity: `0x${'a'.repeat(64)}`,
    };
    const verified: VerifiedWalletControl = {
      address: ADDRESS,
      verifiedAt: '2026-07-26T00:00:01.000Z',
    };
    const proofs = {
      issueChallenge: vi.fn(() => challenge),
      verify: vi.fn(() => Promise.resolve(verified)),
    };
    const listPoaps = vi.fn(() =>
      Promise.resolve({
        source: 'poap_compass' as const,
        items: [],
        truncated: false,
      }),
    );
    const history: PoapCollectionReaderPort = {
      listByAddress: listPoaps,
    };
    const listEnsNames = vi.fn(() =>
      Promise.resolve({
        provider: 'the_graph' as const,
        dataset: 'ens' as const,
        network: 'ethereum' as const,
        subgraphId: '5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH',
        sourceRef: 'the-graph:ens:ethereum:5XqPmWe6gjyrJtFn9cLy237i4cWw2j9HcUJEXsP5qGtH',
        ownedNames: ['nook.eth'],
        truncated: false,
      }),
    );
    const ens: EnsNameReaderPort = {
      listOwnedNames: listEnsNames,
    };
    const service = new WalletEvidenceService({ proofs, history, ens });

    const result = await service.verifyWalletEvidence({
      challenge,
      signature: `0x${'b'.repeat(130)}`,
    });

    expect(result).toMatchObject({
      provider: 'poap_compass',
      walletControl: verified,
      theGraph: {
        provider: 'the_graph',
        dataset: 'ens',
        ownedNames: ['nook.eth'],
      },
    });
    expect(listPoaps).toHaveBeenCalledWith(ADDRESS);
    expect(listEnsNames).toHaveBeenCalledWith(ADDRESS);
  });
});
