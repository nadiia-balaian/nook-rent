import { hashSignal, signRequest, type RpContext } from '@worldcoin/idkit-core';
import { z } from 'zod';

import type { WorldIdEnvironment } from './environment.js';

export const MEMBER_WORLD_ID_SESSION = 'nook-member-session';

const worldIdSessionResponseSchema = z
  .object({
    identifier: z.string().min(1),
    signal_hash: z.string().regex(/^0x[0-9a-fA-F]+$/),
    session_nullifier: z.tuple([
      z.string().regex(/^0x[0-9a-fA-F]+$/),
      z.string().regex(/^0x[0-9a-fA-F]+$/),
    ]),
  })
  .passthrough();

const worldIdSessionResultSchema = z
  .object({
    protocol_version: z.literal('4.0'),
    nonce: z.string().min(1),
    session_id: z.string().regex(/^session_[0-9a-fA-F]{128}$/),
    environment: z.enum(['production', 'staging', 'sandbox']),
    responses: z.array(worldIdSessionResponseSchema).min(1),
  })
  .passthrough();

export class WorldIdVerificationError extends Error {
  constructor(
    readonly reason: 'invalid_world_id_proof' | 'world_id_provider_unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'WorldIdVerificationError';
  }
}

export interface WorldIdVerificationResult {
  provider: 'world_id';
  credential: 'proof_of_human';
  environment: 'production' | 'staging' | 'sandbox';
  worldSessionId: string;
  sessionNullifierDecimal: string;
  protocolVersion: '4.0';
}

export class WorldIdMemberVerification {
  constructor(
    private readonly environment: WorldIdEnvironment,
    private readonly fetch: typeof globalThis.fetch = globalThis.fetch,
  ) {}

  publicConfig() {
    return {
      appId: this.environment.appId,
      rpId: this.environment.rpId,
      mode: 'session' as const,
      environment: this.environment.environment,
    };
  }

  verificationKey(): string {
    return MEMBER_WORLD_ID_SESSION;
  }

  createRpContext(): RpContext {
    const signature = signRequest({
      signingKeyHex: this.environment.signingKey,
    });

    return {
      rp_id: this.environment.rpId,
      nonce: signature.nonce,
      created_at: signature.createdAt,
      expires_at: signature.expiresAt,
      signature: signature.sig,
    };
  }

  async verifyProof(input: {
    proof: unknown;
    expectedSignal: string;
  }): Promise<WorldIdVerificationResult> {
    const parsed = worldIdSessionResultSchema.safeParse(input.proof);

    if (!parsed.success) {
      throw new WorldIdVerificationError(
        'invalid_world_id_proof',
        'World ID returned an invalid session proof payload',
      );
    }

    if (parsed.data.environment !== this.environment.environment) {
      throw new WorldIdVerificationError(
        'invalid_world_id_proof',
        'World ID proof is bound to a different environment',
      );
    }

    const response = parsed.data.responses.find((item) =>
      ['orb', 'proof_of_human'].includes(item.identifier),
    );
    const expectedSignalHash = hashSignal(input.expectedSignal).toLowerCase();

    if (!response || response.signal_hash.toLowerCase() !== expectedSignalHash) {
      throw new WorldIdVerificationError(
        'invalid_world_id_proof',
        'World ID proof is not bound to the expected Member profile',
      );
    }

    let verificationResponse: Response;

    try {
      verificationResponse = await this.fetch(
        `https://developer.world.org/api/v4/verify/${encodeURIComponent(this.environment.rpId)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(parsed.data),
          signal: AbortSignal.timeout(8_000),
        },
      );
    } catch {
      throw new WorldIdVerificationError(
        'world_id_provider_unavailable',
        'World ID proof verification is temporarily unavailable',
      );
    }

    if (!verificationResponse.ok) {
      throw new WorldIdVerificationError(
        'invalid_world_id_proof',
        'World ID could not verify this proof',
      );
    }

    return {
      provider: 'world_id',
      credential: 'proof_of_human',
      environment: this.environment.environment,
      worldSessionId: parsed.data.session_id,
      sessionNullifierDecimal: BigInt(response.session_nullifier[0]).toString(10),
      protocolVersion: parsed.data.protocol_version,
    };
  }
}

export { WorldIdMemberVerification as WorldIdHostVerification };
