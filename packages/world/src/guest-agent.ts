import { createAgentkitClient, type AgentkitFetchEvent } from '@worldcoin/agentkit';
import { privateKeyToAccount } from 'viem/accounts';

export interface WorldGuestAgentClientOptions {
  privateKey: `0x${string}`;
  resourceUri: string;
  fetch?: typeof fetch;
  onEvent?: (event: AgentkitFetchEvent) => void;
}

export function createWorldGuestAgentClient(options: WorldGuestAgentClientOptions) {
  const account = privateKeyToAccount(options.privateKey);
  const client = createAgentkitClient({
    signer: {
      address: account.address,
      chainId: 'eip155:480',
      type: 'eip191',
      signMessage: async (message) => account.signMessage({ message }),
    },
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.onEvent ? { onEvent: options.onEvent } : {}),
  });

  return {
    agentAddress: account.address,
    async createReservationHold(input: {
      quoteId: string;
      idempotencyKey: string;
    }): Promise<Response> {
      return client.fetch(options.resourceUri, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': input.idempotencyKey,
        },
        body: JSON.stringify({ quoteId: input.quoteId }),
      });
    },
  };
}
