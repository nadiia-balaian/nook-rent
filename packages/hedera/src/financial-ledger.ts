import { type Client, TransactionId, TransferTransaction } from '@hashgraph/sdk';
import type { FinancialLedgerPort } from '@nook-rent/core';

import type { HederaEnvironment } from './environment.js';
import { executeReservedTransaction } from './sdk-helpers.js';
import type { HederaMirrorNode } from './mirror-node.js';

export class HederaFinancialLedger implements FinancialLedgerPort {
  private readonly reservations = new Map<string, string>();

  constructor(
    private readonly environment: HederaEnvironment,
    private readonly client: Client,
    private readonly mirror: HederaMirrorNode,
  ) {}

  reserveTransactionId(operationId: string): Promise<string> {
    const existing = this.reservations.get(operationId);

    if (existing) {
      return Promise.resolve(existing);
    }

    const transactionId = TransactionId.generate(this.environment.operatorAccountId).toString();
    this.reservations.set(operationId, transactionId);
    return Promise.resolve(transactionId);
  }

  async submitDeposit(input: {
    operationId: string;
    submissionTransactionId: string;
    bookingId: string;
    tokenId: string;
    amount: { toString(): string };
  }): Promise<{ transactionId: string }> {
    if (input.tokenId !== this.environment.tokenId.toString()) {
      throw new Error('Booking token does not match the configured Hedera Testnet token');
    }

    const amount = BigInt(input.amount.toString());

    if (amount <= 0n) {
      throw new Error('Hedera deposit amount must be greater than zero');
    }

    const confirmed = await executeReservedTransaction(
      new TransferTransaction()
        .addTokenTransfer(this.environment.tokenId, this.environment.operatorAccountId, -amount)
        .addTokenTransfer(this.environment.tokenId, this.environment.escrowAccountId, amount)
        .setTransactionMemo('Nook.rent Testnet deposit'),
      input.submissionTransactionId,
      this.client,
    );

    if (confirmed.receipt.status.toString() !== 'SUCCESS') {
      throw new Error(`Hedera deposit failed with ${confirmed.receipt.status.toString()}`);
    }

    return { transactionId: confirmed.transactionId };
  }

  async getTransactionStatus(transactionId: string) {
    return this.mirror.getTransactionStatus(transactionId);
  }
}
