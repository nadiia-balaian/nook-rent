import { PrivateKey } from '@hashgraph/sdk';
import { describe, expect, it } from 'vitest';

import {
  HederaConfigurationError,
  parseHederaSetupEnvironment,
  parseOptionalHederaEnvironment,
} from '../src/environment.js';

function validEnvironment() {
  return {
    HEDERA_NETWORK: 'testnet',
    HEDERA_OPERATOR_ACCOUNT_ID: '0.0.1001',
    HEDERA_OPERATOR_PRIVATE_KEY: PrivateKey.generateED25519().toStringDer(),
    HEDERA_TOKEN_ID: '0.0.7001',
    HEDERA_HCS_TOPIC_ID: '0.0.8001',
    HEDERA_ESCROW_ACCOUNT_ID: '0.0.2002',
  };
}

describe('Hedera environment', () => {
  it('keeps the provider disabled when no Hedera values are configured', () => {
    expect(parseOptionalHederaEnvironment({})).toBeUndefined();
  });

  it('parses a complete Testnet configuration', () => {
    const environment = parseOptionalHederaEnvironment(validEnvironment());

    expect(environment?.network).toBe('testnet');
    expect(environment?.operatorAccountId.toString()).toBe('0.0.1001');
    expect(environment?.tokenId.toString()).toBe('0.0.7001');
    expect(environment?.topicId.toString()).toBe('0.0.8001');
    expect(environment?.escrowAccountId.toString()).toBe('0.0.2002');
    expect(environment?.mirrorNodeUrl).toBe('https://testnet.mirrornode.hedera.com');
  });

  it('parses a raw ECDSA operator key without treating it as DER', () => {
    const privateKey = PrivateKey.generateECDSA();
    const environment = parseOptionalHederaEnvironment({
      ...validEnvironment(),
      HEDERA_OPERATOR_PRIVATE_KEY: `0x${privateKey.toStringRaw()}`,
    });

    expect(environment?.operatorPrivateKey.publicKey.toStringRaw()).toBe(
      privateKey.publicKey.toStringRaw(),
    );
  });

  it('parses separate setup signers before token and topic creation', () => {
    const operatorPrivateKey = PrivateKey.generateECDSA();
    const escrowPrivateKey = PrivateKey.generateECDSA();
    const environment = parseHederaSetupEnvironment({
      HEDERA_NETWORK: 'testnet',
      HEDERA_OPERATOR_ACCOUNT_ID: '0.0.1001',
      HEDERA_OPERATOR_PRIVATE_KEY: operatorPrivateKey.toStringRaw(),
      HEDERA_ESCROW_ACCOUNT_ID: '0.0.2002',
      HEDERA_ESCROW_PRIVATE_KEY: escrowPrivateKey.toStringRaw(),
    });

    expect(environment.operatorPrivateKey.publicKey.toStringRaw()).toBe(
      operatorPrivateKey.publicKey.toStringRaw(),
    );
    expect(environment.escrowPrivateKey.publicKey.toStringRaw()).toBe(
      escrowPrivateKey.publicKey.toStringRaw(),
    );
    expect(environment.existingTokenId).toBeUndefined();
    expect(environment.existingTopicId).toBeUndefined();
  });

  it('fails fast for partial configuration or a non-Testnet network', () => {
    expect(() =>
      parseOptionalHederaEnvironment({
        HEDERA_OPERATOR_ACCOUNT_ID: '0.0.1001',
      }),
    ).toThrow(HederaConfigurationError);
    expect(() =>
      parseOptionalHederaEnvironment({
        ...validEnvironment(),
        HEDERA_NETWORK: 'mainnet',
      }),
    ).toThrow('HEDERA_NETWORK must be testnet');
  });
});
