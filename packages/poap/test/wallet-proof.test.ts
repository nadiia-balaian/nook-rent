import { privateKeyToAccount } from 'viem/accounts';
import { describe, expect, it } from 'vitest';

import { EvmWalletProofService, InvalidWalletControlProofError } from '../src/wallet-proof.js';

const wallet = privateKeyToAccount(
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
);

describe('EVM wallet control proof', () => {
  it('verifies a purpose-bound, short-lived signed challenge', async () => {
    const proofs = new EvmWalletProofService({
      secret: 'test-only-secret-that-is-at-least-32-characters',
      now: () => '2026-07-25T10:00:00.000Z',
      nonce: () => 'fixed-nonce',
      ttlSeconds: 300,
    });
    const challenge = proofs.issueChallenge(wallet.address);
    const signature = await wallet.signMessage({
      message: challenge.message,
    });

    expect(challenge).toMatchObject({
      address: wallet.address,
      expiresAt: '2026-07-25T10:05:00.000Z',
      integrity: expect.stringMatching(/^0x[0-9a-f]{64}$/),
    });
    expect(challenge.message).toContain('does not send a transaction');
    await expect(proofs.verify({ challenge, signature })).resolves.toEqual({
      address: wallet.address,
      verifiedAt: '2026-07-25T10:00:00.000Z',
    });
  });

  it('rejects a signature from another address and challenge tampering', async () => {
    const proofs = new EvmWalletProofService({
      secret: 'test-only-secret-that-is-at-least-32-characters',
      now: () => '2026-07-25T10:00:00.000Z',
      nonce: () => 'fixed-nonce',
    });
    const challenge = proofs.issueChallenge(wallet.address);
    const otherWallet = privateKeyToAccount(
      '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
    );
    const signature = await otherWallet.signMessage({
      message: challenge.message,
    });

    await expect(proofs.verify({ challenge, signature })).rejects.toThrow(
      InvalidWalletControlProofError,
    );
    await expect(
      proofs.verify({
        challenge: {
          ...challenge,
          message: `${challenge.message}\ntampered`,
        },
        signature,
      }),
    ).rejects.toThrow(InvalidWalletControlProofError);
  });
});
