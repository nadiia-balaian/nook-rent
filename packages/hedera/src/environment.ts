import {
  AccountId,
  Client,
  PrivateKey,
  TokenId,
  TopicId,
  type TransactionId,
} from '@hashgraph/sdk';

export interface HederaEnvironment {
  network: 'testnet';
  operatorAccountId: AccountId;
  operatorPrivateKey: PrivateKey;
  tokenId: TokenId;
  topicId: TopicId;
  escrowAccountId: AccountId;
  mirrorNodeUrl: string;
}

export interface HederaSetupEnvironment {
  network: 'testnet';
  operatorAccountId: AccountId;
  operatorPrivateKey: PrivateKey;
  escrowAccountId: AccountId;
  escrowPrivateKey: PrivateKey;
  existingTokenId?: TokenId;
  existingTopicId?: TopicId;
}

export class HederaConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HederaConfigurationError';
  }
}

const requiredNames = [
  'HEDERA_OPERATOR_ACCOUNT_ID',
  'HEDERA_OPERATOR_PRIVATE_KEY',
  'HEDERA_TOKEN_ID',
  'HEDERA_HCS_TOPIC_ID',
  'HEDERA_ESCROW_ACCOUNT_ID',
] as const;

function required(environment: Record<string, string | undefined>, name: string): string {
  const value = environment[name]?.trim();

  if (!value) {
    throw new HederaConfigurationError(`${name} is required when Hedera is enabled`);
  }

  return value;
}

function parseEntity<T>(value: string, label: string, parse: (input: string) => T): T {
  try {
    return parse(value);
  } catch {
    throw new HederaConfigurationError(`${label} is not a valid Hedera ID`);
  }
}

function parsePrivateKey(value: string, label: string): PrivateKey {
  const normalized = value.trim();
  const rawHex = normalized.replace(/^0x/i, '');

  if (/^[\da-f]{64}$/i.test(rawHex)) {
    try {
      return PrivateKey.fromStringECDSA(normalized);
    } catch {
      throw new HederaConfigurationError(`${label} is not a valid raw ECDSA private key`);
    }
  }

  const parsers = [
    (input: string) => PrivateKey.fromStringDer(input),
    (input: string) => PrivateKey.fromStringECDSA(input),
    (input: string) => PrivateKey.fromStringED25519(input),
  ];

  for (const parser of parsers) {
    try {
      return parser(normalized);
    } catch {
      // Continue through the SDK-supported Hedera private-key encodings.
    }
  }

  throw new HederaConfigurationError(`${label} is not a supported Hedera private key`);
}

function requireTestnet(environment: Record<string, string | undefined>): 'testnet' {
  const network = environment.HEDERA_NETWORK?.trim() || 'testnet';

  if (network !== 'testnet') {
    throw new HederaConfigurationError('HEDERA_NETWORK must be testnet');
  }

  return network;
}

function mirrorNodeUrl(environment: Record<string, string | undefined>): string {
  const value =
    environment.HEDERA_MIRROR_NODE_URL?.trim() || 'https://testnet.mirrornode.hedera.com';

  try {
    const url = new URL(value);

    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error('unsupported protocol');
    }
  } catch {
    throw new HederaConfigurationError('HEDERA_MIRROR_NODE_URL must be an HTTP(S) URL');
  }

  return value.replace(/\/+$/, '');
}

export function parseOptionalHederaEnvironment(
  environment: Record<string, string | undefined>,
): HederaEnvironment | undefined {
  const configuredCount = requiredNames.filter((name) => environment[name]?.trim()).length;

  if (configuredCount === 0) {
    return undefined;
  }

  return {
    network: requireTestnet(environment),
    operatorAccountId: parseEntity(
      required(environment, 'HEDERA_OPERATOR_ACCOUNT_ID'),
      'HEDERA_OPERATOR_ACCOUNT_ID',
      (value) => AccountId.fromString(value),
    ),
    operatorPrivateKey: parsePrivateKey(
      required(environment, 'HEDERA_OPERATOR_PRIVATE_KEY'),
      'HEDERA_OPERATOR_PRIVATE_KEY',
    ),
    tokenId: parseEntity(required(environment, 'HEDERA_TOKEN_ID'), 'HEDERA_TOKEN_ID', (value) =>
      TokenId.fromString(value),
    ),
    topicId: parseEntity(
      required(environment, 'HEDERA_HCS_TOPIC_ID'),
      'HEDERA_HCS_TOPIC_ID',
      (value) => TopicId.fromString(value),
    ),
    escrowAccountId: parseEntity(
      required(environment, 'HEDERA_ESCROW_ACCOUNT_ID'),
      'HEDERA_ESCROW_ACCOUNT_ID',
      (value) => AccountId.fromString(value),
    ),
    mirrorNodeUrl: mirrorNodeUrl(environment),
  };
}

export function parseHederaSetupEnvironment(
  environment: Record<string, string | undefined>,
): HederaSetupEnvironment {
  const tokenId = environment.HEDERA_TOKEN_ID?.trim();
  const topicId = environment.HEDERA_HCS_TOPIC_ID?.trim();

  return {
    network: requireTestnet(environment),
    operatorAccountId: parseEntity(
      required(environment, 'HEDERA_OPERATOR_ACCOUNT_ID'),
      'HEDERA_OPERATOR_ACCOUNT_ID',
      (value) => AccountId.fromString(value),
    ),
    operatorPrivateKey: parsePrivateKey(
      required(environment, 'HEDERA_OPERATOR_PRIVATE_KEY'),
      'HEDERA_OPERATOR_PRIVATE_KEY',
    ),
    escrowAccountId: parseEntity(
      required(environment, 'HEDERA_ESCROW_ACCOUNT_ID'),
      'HEDERA_ESCROW_ACCOUNT_ID',
      (value) => AccountId.fromString(value),
    ),
    escrowPrivateKey: parsePrivateKey(
      required(environment, 'HEDERA_ESCROW_PRIVATE_KEY'),
      'HEDERA_ESCROW_PRIVATE_KEY',
    ),
    ...(tokenId
      ? {
          existingTokenId: parseEntity(tokenId, 'HEDERA_TOKEN_ID', (value) =>
            TokenId.fromString(value),
          ),
        }
      : {}),
    ...(topicId
      ? {
          existingTopicId: parseEntity(topicId, 'HEDERA_HCS_TOPIC_ID', (value) =>
            TopicId.fromString(value),
          ),
        }
      : {}),
  };
}

export function createHederaClient(
  environment: Pick<HederaEnvironment, 'operatorAccountId' | 'operatorPrivateKey'>,
): Client {
  const client = Client.forTestnet();
  client.setOperator(environment.operatorAccountId, environment.operatorPrivateKey);
  return client;
}

export function transactionIdString(transactionId: TransactionId): string {
  return transactionId.toString();
}
