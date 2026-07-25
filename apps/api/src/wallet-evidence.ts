import { summarizePoapCollection } from '@nook-rent/core';
import type { EnsNameReaderPort, PoapCollectionReaderPort } from '@nook-rent/core';
import type { VerifiedWalletControl, WalletChallenge } from '@nook-rent/poap';

interface WalletProofPort {
  issueChallenge(address: string): WalletChallenge;
  verify(input: { challenge: WalletChallenge; signature: string }): Promise<VerifiedWalletControl>;
}

export class WalletEvidenceService {
  constructor(
    private readonly dependencies: {
      history: PoapCollectionReaderPort;
      proofs: WalletProofPort;
      ens?: EnsNameReaderPort;
    },
  ) {}

  createChallenge(address: string): WalletChallenge {
    return this.dependencies.proofs.issueChallenge(address);
  }

  async verifyWalletEvidence(input: { challenge: WalletChallenge; signature: string }) {
    const proof = await this.dependencies.proofs.verify(input);
    const [history, ens] = await Promise.all([
      this.dependencies.history.listByAddress(proof.address),
      this.dependencies.ens?.listOwnedNames(proof.address),
    ]);

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
      ...(ens ? { theGraph: ens } : {}),
    };
  }
}
