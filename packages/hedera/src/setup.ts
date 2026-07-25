import {
  AccountInfoQuery,
  type Client,
  Hbar,
  PublicKey,
  ReceiptStatusError,
  TokenAssociateTransaction,
  TokenCreateTransaction,
  TokenSupplyType,
  TopicCreateTransaction,
} from '@hashgraph/sdk';

import type { HederaSetupEnvironment } from './environment.js';
import { requireReceiptValue } from './sdk-helpers.js';

const INITIAL_SUPPLY_ATOMIC = 10_000_000;

export interface HederaSetupProgress {
  step:
    | 'signers_verified'
    | 'token_created'
    | 'token_reused'
    | 'topic_created'
    | 'topic_reused'
    | 'escrow_associated'
    | 'escrow_association_reused';
  resourceId?: string;
  transactionId?: string;
}

export interface HederaSetupResult {
  network: 'testnet';
  tokenId: string;
  topicId: string;
  tokenCreated: boolean;
  topicCreated: boolean;
  escrowAssociationCreated: boolean;
  transactionIds: {
    tokenCreate?: string;
    topicCreate?: string;
    escrowAssociation?: string;
  };
}

function emit(
  onProgress: ((progress: HederaSetupProgress) => void) | undefined,
  progress: HederaSetupProgress,
): void {
  onProgress?.(progress);
}

async function requireMatchingSigner(
  client: Client,
  accountId: HederaSetupEnvironment['operatorAccountId'],
  privateKey: HederaSetupEnvironment['operatorPrivateKey'],
  label: string,
): Promise<void> {
  const account = await new AccountInfoQuery().setAccountId(accountId).execute(client);

  if (
    !(account.key instanceof PublicKey) ||
    account.key.toStringRaw() !== privateKey.publicKey.toStringRaw()
  ) {
    throw new Error(`${label} private key does not match its Hedera Testnet account`);
  }
}

async function associateEscrow(
  environment: HederaSetupEnvironment,
  client: Client,
  tokenId: NonNullable<HederaSetupEnvironment['existingTokenId']>,
): Promise<string | undefined> {
  try {
    const transaction = await new TokenAssociateTransaction()
      .setAccountId(environment.escrowAccountId)
      .setTokenIds([tokenId])
      .setMaxTransactionFee(new Hbar(5))
      .freezeWith(client)
      .sign(environment.escrowPrivateKey);
    const response = await transaction.execute(client);

    await response.getReceipt(client);
    return response.transactionId.toString();
  } catch (error) {
    if (
      error instanceof ReceiptStatusError &&
      error.status.toString() === 'TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT'
    ) {
      return undefined;
    }

    throw error;
  }
}

export async function setupHederaResources(
  environment: HederaSetupEnvironment,
  client: Client,
  onProgress?: (progress: HederaSetupProgress) => void,
): Promise<HederaSetupResult> {
  if (environment.operatorAccountId.equals(environment.escrowAccountId)) {
    throw new Error('Hedera operator and escrow accounts must be different');
  }

  await requireMatchingSigner(
    client,
    environment.operatorAccountId,
    environment.operatorPrivateKey,
    'Operator',
  );
  await requireMatchingSigner(
    client,
    environment.escrowAccountId,
    environment.escrowPrivateKey,
    'Escrow',
  );
  emit(onProgress, { step: 'signers_verified' });

  let tokenId = environment.existingTokenId;
  let tokenCreateTransactionId: string | undefined;

  if (tokenId) {
    emit(onProgress, { step: 'token_reused', resourceId: tokenId.toString() });
  } else {
    const response = await new TokenCreateTransaction()
      .setTokenName('Nook.rent Demo Token')
      .setTokenSymbol('NOOK')
      .setTokenMemo('Nook.rent Testnet settlement token')
      .setDecimals(2)
      .setInitialSupply(INITIAL_SUPPLY_ATOMIC)
      .setSupplyType(TokenSupplyType.Infinite)
      .setTreasuryAccountId(environment.operatorAccountId)
      .setAdminKey(environment.operatorPrivateKey.publicKey)
      .setSupplyKey(environment.operatorPrivateKey.publicKey)
      .setMaxTransactionFee(new Hbar(20))
      .execute(client);
    const receipt = await response.getReceipt(client);
    tokenId = requireReceiptValue(receipt.tokenId, 'HTS token ID');
    tokenCreateTransactionId = response.transactionId.toString();
    emit(onProgress, {
      step: 'token_created',
      resourceId: tokenId.toString(),
      transactionId: tokenCreateTransactionId,
    });
  }

  let topicId = environment.existingTopicId;
  let topicCreateTransactionId: string | undefined;

  if (topicId) {
    emit(onProgress, { step: 'topic_reused', resourceId: topicId.toString() });
  } else {
    const response = await new TopicCreateTransaction()
      .setTopicMemo('Nook.rent public booking evidence')
      .setAdminKey(environment.operatorPrivateKey.publicKey)
      .setSubmitKey(environment.operatorPrivateKey.publicKey)
      .setMaxTransactionFee(new Hbar(5))
      .execute(client);
    const receipt = await response.getReceipt(client);
    topicId = requireReceiptValue(receipt.topicId, 'HCS topic ID');
    topicCreateTransactionId = response.transactionId.toString();
    emit(onProgress, {
      step: 'topic_created',
      resourceId: topicId.toString(),
      transactionId: topicCreateTransactionId,
    });
  }

  const escrowAssociationTransactionId = await associateEscrow(environment, client, tokenId);
  emit(onProgress, {
    step: escrowAssociationTransactionId ? 'escrow_associated' : 'escrow_association_reused',
    ...(escrowAssociationTransactionId ? { transactionId: escrowAssociationTransactionId } : {}),
    resourceId: tokenId.toString(),
  });

  return {
    network: environment.network,
    tokenId: tokenId.toString(),
    topicId: topicId.toString(),
    tokenCreated: !environment.existingTokenId,
    topicCreated: !environment.existingTopicId,
    escrowAssociationCreated: Boolean(escrowAssociationTransactionId),
    transactionIds: {
      ...(tokenCreateTransactionId ? { tokenCreate: tokenCreateTransactionId } : {}),
      ...(topicCreateTransactionId ? { topicCreate: topicCreateTransactionId } : {}),
      ...(escrowAssociationTransactionId
        ? { escrowAssociation: escrowAssociationTransactionId }
        : {}),
    },
  };
}
