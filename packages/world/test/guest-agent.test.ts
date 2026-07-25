import { describe, expect, it } from 'vitest';

import { WorldAgentkitAuthorization } from '../src/authorization.js';
import { createWorldGuestAgentClient } from '../src/guest-agent.js';

const RESOURCE_URI = 'https://api.nook.rent/v1/reservation-holds';

describe('World Guest Agent client', () => {
  it('reports a live human-backed connection without exposing the AgentBook human identifier', async () => {
    const client = createWorldGuestAgentClient({
      privateKey: `0x${'1'.repeat(64)}`,
      resourceUri: RESOURCE_URI,
      lookupHuman: () => Promise.resolve('private-world-human-id'),
    });

    await expect(client.getConnectionStatus()).resolves.toEqual({
      provider: 'world_agentkit',
      humanBacked: true,
      network: 'world_chain',
    });
    expect(client.getAgentAddress()).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });

  it('uses AgentKit to sign a 402 challenge and retry the protected request', async () => {
    const challenge = new WorldAgentkitAuthorization(
      {
        resourceUri: RESOURCE_URI,
        humanReferenceSecret: 'test-only-secret-with-at-least-32-characters',
      },
      {
        now: () => new Date('2026-07-25T12:00:00.000Z'),
        nonce: () => '0123456789abcdef0123456789abcdef',
      },
    ).createChallenge();
    const requests: Request[] = [];
    const fakeFetch: typeof fetch = (input, init) => {
      const request = new Request(input, init);
      requests.push(request);

      if (requests.length === 1) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              x402Version: 2,
              extensions: challenge,
            }),
            {
              status: 402,
              headers: { 'content-type': 'application/json' },
            },
          ),
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({ status: 'created' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      );
    };
    const client = createWorldGuestAgentClient({
      privateKey: `0x${'1'.repeat(64)}`,
      resourceUri: RESOURCE_URI,
      fetch: fakeFetch,
    });

    const response = await client.createReservationHold({
      quoteId: '40000000-0000-4000-8000-000000000001',
      idempotencyKey: 'world-guest-agent-request',
    });

    expect(response.status).toBe(201);
    expect(requests).toHaveLength(2);
    expect(requests[0]?.headers.get('agentkit')).toBeNull();
    expect(requests[1]?.headers.get('agentkit')).toBeTruthy();
    await expect(requests[1]?.clone().json()).resolves.toEqual({
      quoteId: '40000000-0000-4000-8000-000000000001',
    });
  });
});
