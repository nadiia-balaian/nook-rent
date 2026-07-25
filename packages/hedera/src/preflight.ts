import type { HederaEnvironment } from './environment.js';
import type { HederaMirrorNode } from './mirror-node.js';

interface MirrorAccount {
  account?: unknown;
  balance?: {
    tokens?: unknown;
  };
}

interface MirrorTokenBalance {
  token_id?: unknown;
  balance?: unknown;
}

function tokenBalance(account: MirrorAccount, tokenId: string): bigint | undefined {
  if (!Array.isArray(account.balance?.tokens)) {
    return undefined;
  }

  const relationship = (account.balance.tokens as MirrorTokenBalance[]).find(
    (token) => token.token_id === tokenId,
  );

  return relationship &&
    (typeof relationship.balance === 'number' || typeof relationship.balance === 'string')
    ? BigInt(relationship.balance)
    : undefined;
}

export interface HederaPreflightResult {
  network: 'testnet';
  operatorAccountId: string;
  escrowAccountId: string;
  tokenId: string;
  topicId: string;
  operatorTokenBalanceAtomic: string;
  escrowTokenBalanceAtomic: string;
}

export async function runHederaPreflight(
  environment: HederaEnvironment,
  mirror: HederaMirrorNode,
): Promise<HederaPreflightResult> {
  const [operator, escrow] = (await Promise.all([
    mirror.read(`/api/v1/accounts/${environment.operatorAccountId.toString()}`),
    mirror.read(`/api/v1/accounts/${environment.escrowAccountId.toString()}`),
    mirror.read(`/api/v1/tokens/${environment.tokenId.toString()}`),
    mirror.read(`/api/v1/topics/${environment.topicId.toString()}`),
  ])) as [MirrorAccount, MirrorAccount, unknown, unknown];
  const operatorBalance = tokenBalance(operator, environment.tokenId.toString());
  const escrowBalance = tokenBalance(escrow, environment.tokenId.toString());

  if (operatorBalance === undefined) {
    throw new Error('Hedera operator is not associated with the configured token');
  }
  if (escrowBalance === undefined) {
    throw new Error('Hedera escrow account is not associated with the configured token');
  }
  if (operatorBalance <= 0n) {
    throw new Error('Hedera operator has no configured Testnet tokens to deposit');
  }

  return {
    network: environment.network,
    operatorAccountId: environment.operatorAccountId.toString(),
    escrowAccountId: environment.escrowAccountId.toString(),
    tokenId: environment.tokenId.toString(),
    topicId: environment.topicId.toString(),
    operatorTokenBalanceAtomic: operatorBalance.toString(),
    escrowTokenBalanceAtomic: escrowBalance.toString(),
  };
}
