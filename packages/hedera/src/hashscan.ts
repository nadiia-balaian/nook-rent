export function hederaTransactionUrl(transactionId: string): string {
  return `https://hashscan.io/testnet/transaction/${encodeURIComponent(transactionId)}`;
}

export function hederaTopicUrl(topicId: string): string {
  return `https://hashscan.io/testnet/topic/${encodeURIComponent(topicId)}`;
}
