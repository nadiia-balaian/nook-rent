import {
  AGENTKIT,
  type AgentkitPayload,
  type AgentkitValidationOptions,
  type AgentkitValidationResult,
  type AgentkitVerifyResult,
} from '@worldcoin/agentkit';
import { describe, expect, it, vi } from 'vitest';

import { WorldAgentkitAuthorization } from '../src/authorization.js';

const RESOURCE_URI = 'https://api.nook.rent/v1/reservation-holds';
const NOW = new Date('2026-07-25T12:00:00.000Z');
const PAYLOAD: AgentkitPayload = {
  domain: 'api.nook.rent',
  address: `0x${'1'.repeat(40)}`,
  uri: RESOURCE_URI,
  version: '1',
  chainId: 'eip155:480',
  type: 'eip191',
  nonce: 'abcdef0123456789abcdef0123456789',
  issuedAt: NOW.toISOString(),
  signature: `0x${'2'.repeat(130)}`,
};

function authorization(
  overrides: {
    validation?: AgentkitValidationResult;
    validateMessage?: (
      payload: AgentkitPayload,
      resourceUri: string,
      options?: AgentkitValidationOptions,
    ) => Promise<AgentkitValidationResult>;
    signature?: AgentkitVerifyResult;
    humanId?: string | null;
  } = {},
) {
  return new WorldAgentkitAuthorization(
    {
      resourceUri: RESOURCE_URI,
      humanReferenceSecret: 'test-only-secret-with-at-least-32-characters',
    },
    {
      now: () => NOW,
      nonce: () => '0123456789abcdef0123456789abcdef',
      parseHeader: () => PAYLOAD,
      validateMessage:
        overrides.validateMessage ??
        (() => Promise.resolve(overrides.validation ?? { valid: true })),
      verifySignature: () =>
        Promise.resolve(
          overrides.signature ?? {
            valid: true,
            address: PAYLOAD.address,
          },
        ),
      agentBook: {
        lookupHuman: () =>
          Promise.resolve(
            overrides.humanId === undefined ? 'raw-anonymous-human-id' : overrides.humanId,
          ),
      },
    },
  );
}

describe('World AgentKit authorization', () => {
  it('declares a short-lived World Chain challenge for the protected resource', () => {
    const challenge = authorization().createChallenge()[AGENTKIT];

    expect(challenge.info).toMatchObject({
      domain: 'api.nook.rent',
      uri: RESOURCE_URI,
      nonce: '0123456789abcdef0123456789abcdef',
      issuedAt: NOW.toISOString(),
      expirationTime: '2026-07-25T12:05:00.000Z',
    });
    expect(challenge.supportedChains).toEqual([
      { chainId: 'eip155:480', type: 'eip191' },
      { chainId: 'eip155:480', type: 'eip1271' },
    ]);
  });

  it('returns only a server-safe hash after signature and AgentBook verification', async () => {
    const validateMessage = vi.fn(() => Promise.resolve({ valid: true }));
    const result = await authorization({ validateMessage }).verify({
      header: 'encoded-agentkit-header',
      resourceUri: RESOURCE_URI,
    });

    expect(result).toMatchObject({
      provider: 'world_agentkit',
      agentAddress: PAYLOAD.address,
      nonce: PAYLOAD.nonce,
    });
    expect(result.anonymousHumanRefHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(result)).not.toContain('raw-anonymous-human-id');
    expect(validateMessage).toHaveBeenCalledWith(PAYLOAD, RESOURCE_URI, {
      maxAge: 300_000,
    });
  });

  it('rejects an Agent that AgentBook does not link to a verified human', async () => {
    await expect(
      authorization({ humanId: null }).verify({
        header: 'encoded-agentkit-header',
        resourceUri: RESOURCE_URI,
      }),
    ).rejects.toMatchObject({
      reason: 'agent_not_human_backed',
    });
  });

  it('rejects an invalid or expired signed message', async () => {
    await expect(
      authorization({
        validation: { valid: false, error: 'Message has expired' },
      }).verify({
        header: 'encoded-agentkit-header',
        resourceUri: RESOURCE_URI,
      }),
    ).rejects.toMatchObject({
      reason: 'invalid_agentkit_proof',
    });
  });
});
