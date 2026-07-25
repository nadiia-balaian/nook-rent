import { HumanBackedAuthorizationError } from '@nook-rent/core';
import { createAgentkitClient, type AgentkitFetchEvent } from '@worldcoin/agentkit';
import { createAgentBookVerifier } from '@worldcoin/agentkit';
import { privateKeyToAccount } from 'viem/accounts';

export interface WorldGuestAgentClientOptions {
  privateKey: `0x${string}`;
  resourceUri: string;
  rpcUrl?: string;
  fetch?: typeof fetch;
  onEvent?: (event: AgentkitFetchEvent) => void;
  lookupHuman?: (agentAddress: string) => Promise<string | null>;
}

export function createWorldGuestAgentClient(options: WorldGuestAgentClientOptions) {
  const account = privateKeyToAccount(options.privateKey);
  const agentBook = options.lookupHuman
    ? undefined
    : createAgentBookVerifier(options.rpcUrl ? { rpcUrl: options.rpcUrl } : undefined);
  const lookupHuman =
    options.lookupHuman ?? ((agentAddress: string) => agentBook!.lookupHuman(agentAddress));
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
    getAgentAddress() {
      return account.address;
    },
    async getConnectionStatus() {
      const humanId = await lookupHuman(account.address);

      if (!humanId) {
        throw new HumanBackedAuthorizationError(
          'agent_not_human_backed',
          'The configured Guest Agent is not registered to a verified human in AgentBook',
        );
      }

      return {
        provider: 'world_agentkit' as const,
        humanBacked: true as const,
        network: 'world_chain' as const,
      };
    },
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
