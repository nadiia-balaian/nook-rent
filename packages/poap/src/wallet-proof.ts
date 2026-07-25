import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { getAddress, recoverMessageAddress } from 'viem';

export interface WalletChallenge {
  address: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  message: string;
  integrity: string;
}

export interface VerifiedWalletControl {
  address: string;
  verifiedAt: string;
}

export class InvalidWalletControlProofError extends Error {
  constructor() {
    super('Wallet control proof is invalid or expired');
    this.name = 'InvalidWalletControlProofError';
  }
}

export interface EvmWalletProofServiceConfig {
  secret: string;
  ttlSeconds?: number;
  now?: () => string;
  nonce?: () => string;
}

function canonicalChallenge(challenge: Omit<WalletChallenge, 'integrity'>): string {
  return [
    challenge.address.toLowerCase(),
    challenge.issuedAt,
    challenge.expiresAt,
    challenge.nonce,
    challenge.message,
  ].join('\n');
}

export class EvmWalletProofService {
  readonly #secret: string;
  readonly #ttlSeconds: number;
  readonly #now: () => string;
  readonly #nonce: () => string;

  constructor(config: EvmWalletProofServiceConfig) {
    if (config.secret.length < 32) {
      throw new Error('Wallet challenge secret must contain at least 32 characters');
    }

    this.#secret = config.secret;
    this.#ttlSeconds = config.ttlSeconds ?? 300;
    this.#now = config.now ?? (() => new Date().toISOString());
    this.#nonce = config.nonce ?? (() => randomBytes(16).toString('hex'));
  }

  issueChallenge(address: string): WalletChallenge {
    const checksummedAddress = getAddress(address);
    const issuedAt = this.#now();
    const expiresAt = new Date(Date.parse(issuedAt) + this.#ttlSeconds * 1_000).toISOString();
    const nonce = this.#nonce();
    const message = [
      'Nook.rent wallet evidence',
      '',
      `Address: ${checksummedAddress}`,
      `Issued at: ${issuedAt}`,
      `Expires at: ${expiresAt}`,
      `Nonce: ${nonce}`,
      '',
      'Signing proves address control only. It does not send a transaction, authorize payment, or change Rental Reputation.',
    ].join('\n');
    const unsigned = {
      address: checksummedAddress,
      issuedAt,
      expiresAt,
      nonce,
      message,
    };

    return {
      ...unsigned,
      integrity: this.#integrity(unsigned),
    };
  }

  async verify(input: {
    challenge: WalletChallenge;
    signature: string;
  }): Promise<VerifiedWalletControl> {
    let expectedIntegrity: string;
    let recoveredAddress: string;

    try {
      expectedIntegrity = this.#integrity({
        address: getAddress(input.challenge.address),
        issuedAt: input.challenge.issuedAt,
        expiresAt: input.challenge.expiresAt,
        nonce: input.challenge.nonce,
        message: input.challenge.message,
      });
      const supplied = Buffer.from(input.challenge.integrity.replace(/^0x/, ''), 'hex');
      const expected = Buffer.from(expectedIntegrity.replace(/^0x/, ''), 'hex');

      if (
        supplied.length !== expected.length ||
        !timingSafeEqual(supplied, expected) ||
        Date.parse(input.challenge.expiresAt) <= Date.parse(this.#now())
      ) {
        throw new InvalidWalletControlProofError();
      }

      recoveredAddress = await recoverMessageAddress({
        message: input.challenge.message,
        signature: input.signature as `0x${string}`,
      });
    } catch (error) {
      if (error instanceof InvalidWalletControlProofError) {
        throw error;
      }

      throw new InvalidWalletControlProofError();
    }

    if (getAddress(recoveredAddress) !== getAddress(input.challenge.address)) {
      throw new InvalidWalletControlProofError();
    }

    return {
      address: getAddress(recoveredAddress),
      verifiedAt: this.#now(),
    };
  }

  #integrity(challenge: Omit<WalletChallenge, 'integrity'>): string {
    return `0x${createHmac('sha256', this.#secret)
      .update(canonicalChallenge(challenge))
      .digest('hex')}`;
  }
}
