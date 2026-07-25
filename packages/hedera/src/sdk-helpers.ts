import {
  type Client,
  type PrivateKey,
  type Transaction,
  TransactionId,
  type TransactionReceipt,
  TransactionReceiptQuery,
} from '@hashgraph/sdk';

export interface ConfirmedTransaction {
  transactionId: string;
  receipt: TransactionReceipt;
}

export function requireReceiptValue<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`${label} was missing from the Hedera receipt`);
  }

  return value;
}

async function executeTransaction(
  transaction: Transaction,
  client: Client,
  signers: PrivateKey[] = [],
): Promise<ConfirmedTransaction> {
  let signedTransaction: Transaction = transaction.freezeWith(client);

  for (const signer of signers) {
    signedTransaction = await signedTransaction.sign(signer);
  }

  const response = await signedTransaction.execute(client);
  const receipt = await response.getReceipt(client);

  return {
    transactionId: response.transactionId.toString(),
    receipt,
  };
}

export async function executeReservedTransaction(
  transaction: Transaction,
  transactionId: string,
  client: Client,
  signers: PrivateKey[] = [],
): Promise<ConfirmedTransaction> {
  const parsedTransactionId = TransactionId.fromString(transactionId);

  try {
    return await executeTransaction(
      transaction.setTransactionId(parsedTransactionId),
      client,
      signers,
    );
  } catch (submissionError) {
    try {
      const receipt = await new TransactionReceiptQuery()
        .setTransactionId(parsedTransactionId)
        .execute(client);

      return { transactionId, receipt };
    } catch {
      throw submissionError;
    }
  }
}
