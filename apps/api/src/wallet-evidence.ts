import { summarizePoapCollection } from '@nook-rent/core';
import type { PoapCollectionReaderPort } from '@nook-rent/core';
import type { EvmWalletProofService, WalletChallenge } from '@nook-rent/poap';

export class WalletEvidenceService {
  constructor(
    private readonly dependencies: {
      history: PoapCollectionReaderPort;
      proofs: EvmWalletProofService;
    },
  ) {}

  createChallenge(address: string): WalletChallenge {
    return this.dependencies.proofs.issueChallenge(address);
  }

  async verifyPoapCollection(input: { challenge: WalletChallenge; signature: string }) {
    const proof = await this.dependencies.proofs.verify(input);
    const history = await this.dependencies.history.listByAddress(proof.address);

    return {
      provider: history.source,
      walletControl: {
        verified: true as const,
        address: proof.address,
        verifiedAt: proof.verifiedAt,
      },
      signals: summarizePoapCollection(history),
      recentPoaps: history.items.slice(0, 4),
      truncated: history.truncated,
    };
  }
}
