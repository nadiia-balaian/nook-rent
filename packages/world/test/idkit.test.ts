import { hashSignal } from '@worldcoin/idkit-core';
import { describe, expect, it, vi } from 'vitest';

import { MEMBER_WORLD_ID_SESSION, WorldIdMemberVerification } from '../src/idkit.js';
import type { WorldIdVerificationError } from '../src/idkit.js';

const environment = {
  appId: 'app_nook_test' as const,
  rpId: 'rp_nook_test' as const,
  signingKey: `0x${'1'.repeat(64)}` as const,
  environment: 'staging' as const,
};
const memberProfileId = '10000000-0000-4000-8000-000000000001';
const worldSessionId = `session_${'a'.repeat(128)}`;

function proof(signal = memberProfileId) {
  return {
    protocol_version: '4.0',
    nonce: 'world-id-test-nonce',
    session_id: worldSessionId,
    environment: 'staging',
    responses: [
      {
        identifier: 'proof_of_human',
        signal_hash: hashSignal(signal),
        session_nullifier: ['0x2a', '0x2b'],
      },
    ],
  };
}

describe('World ID Member verification', () => {
  it('creates a signed RP context without returning the signing key', () => {
    const verification = new WorldIdMemberVerification(environment);

    expect(verification.publicConfig()).toEqual({
      appId: 'app_nook_test',
      rpId: 'rp_nook_test',
      mode: 'session',
      environment: 'staging',
    });
    expect(verification.verificationKey()).toBe(MEMBER_WORLD_ID_SESSION);
    expect(verification.createRpContext()).toMatchObject({
      rp_id: 'rp_nook_test',
      nonce: expect.any(String),
      signature: expect.stringMatching(/^0x/),
    });
    expect(JSON.stringify(verification.publicConfig())).not.toContain(environment.signingKey);
  });

  it('verifies a Member-bound session proof and returns continuity and replay identifiers', async () => {
    const providerFetch = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const verification = new WorldIdMemberVerification(environment, providerFetch);

    await expect(
      verification.verifyProof({
        proof: proof(),
        expectedSignal: memberProfileId,
      }),
    ).resolves.toEqual({
      provider: 'world_id',
      credential: 'proof_of_human',
      environment: 'staging',
      worldSessionId,
      sessionNullifierDecimal: '42',
      protocolVersion: '4.0',
    });
    expect(providerFetch).toHaveBeenCalledOnce();
  });

  it('rejects a session proof bound to another Member session before calling World', async () => {
    const providerFetch = vi.fn<typeof fetch>();
    const verification = new WorldIdMemberVerification(environment, providerFetch);

    await expect(
      verification.verifyProof({
        proof: proof('another-member'),
        expectedSignal: memberProfileId,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<WorldIdVerificationError>>({
        reason: 'invalid_world_id_proof',
      }),
    );
    expect(providerFetch).not.toHaveBeenCalled();
  });
});
