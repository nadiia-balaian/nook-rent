import { createHmac, randomBytes } from 'node:crypto';

import type { HumanBackedAuthorization, HumanBackedAuthorizationPort } from '@nook-rent/core';
import { HumanBackedAuthorizationError } from '@nook-rent/core';
import {
  AGENTKIT,
  type AgentBookVerifier,
  type AgentkitExtension,
  type AgentkitPayload,
  createAgentBookVerifier,
  declareAgentkitExtension,
  parseAgentkitHeader,
  validateAgentkitMessage,
  verifyAgentkitSignature,
} from '@worldcoin/agentkit';

import type { WorldVerifierEnvironment } from './environment.js';

const CHALLENGE_LIFETIME_MILLISECONDS = 5 * 60 * 1000;
const WORLD_CHAIN = 'eip155:480';

interface WorldAgentkitDependencies {
  now: () => Date;
  nonce: () => string;
  parseHeader: (header: string) => AgentkitPayload;
  validateMessage: typeof validateAgentkitMessage;
  verifySignature: typeof verifyAgentkitSignature;
  agentBook: Pick<AgentBookVerifier, 'lookupHuman'>;
}

export interface WorldAgentkitChallenge {
  [AGENTKIT]: AgentkitExtension;
}

function defaultDependencies(environment: WorldVerifierEnvironment): WorldAgentkitDependencies {
  return {
    now: () => new Date(),
    nonce: () => randomBytes(16).toString('hex'),
    parseHeader: parseAgentkitHeader,
    validateMessage: validateAgentkitMessage,
    verifySignature: verifyAgentkitSignature,
    agentBook: createAgentBookVerifier(
      environment.rpcUrl ? { rpcUrl: environment.rpcUrl } : undefined,
    ),
  };
}

export class WorldAgentkitAuthorization implements HumanBackedAuthorizationPort {
  private readonly dependencies: WorldAgentkitDependencies;

  constructor(
    private readonly environment: WorldVerifierEnvironment,
    dependencies?: Partial<WorldAgentkitDependencies>,
  ) {
    this.dependencies = {
      ...defaultDependencies(environment),
      ...dependencies,
    };
  }

  createChallenge(): WorldAgentkitChallenge {
    const now = this.dependencies.now();
    const declaration = declareAgentkitExtension({
      domain: new URL(this.environment.resourceUri).hostname,
      resourceUri: this.environment.resourceUri,
      statement: 'Authorize the Nook.rent Guest Agent to place one temporary Reservation Hold.',
      network: WORLD_CHAIN,
      expirationSeconds: CHALLENGE_LIFETIME_MILLISECONDS / 1000,
      mode: { type: 'free' },
    })[AGENTKIT];

    if (!declaration) {
      throw new HumanBackedAuthorizationError(
        'authorization_provider_unavailable',
        'World AgentKit did not create an authorization challenge',
      );
    }

    return {
      [AGENTKIT]: {
        info: {
          ...declaration.info,
          nonce: this.dependencies.nonce(),
          issuedAt: now.toISOString(),
          expirationTime: new Date(now.getTime() + CHALLENGE_LIFETIME_MILLISECONDS).toISOString(),
        },
        supportedChains: declaration.supportedChains,
        schema: declaration.schema,
      },
    };
  }

  async verify(input: { header: string; resourceUri: string }): Promise<HumanBackedAuthorization> {
    if (input.resourceUri !== this.environment.resourceUri) {
      throw new HumanBackedAuthorizationError(
        'invalid_agentkit_proof',
        'AgentKit proof is bound to a different protected resource',
      );
    }

    try {
      const payload = this.dependencies.parseHeader(input.header);
      const validation = await this.dependencies.validateMessage(payload, input.resourceUri, {
        maxAge: CHALLENGE_LIFETIME_MILLISECONDS,
      });

      if (!validation.valid) {
        throw new HumanBackedAuthorizationError(
          'invalid_agentkit_proof',
          validation.error ?? 'AgentKit message validation failed',
        );
      }

      const signature = await this.dependencies.verifySignature(payload, this.environment.rpcUrl);

      if (!signature.valid || !signature.address) {
        throw new HumanBackedAuthorizationError(
          'invalid_agentkit_proof',
          signature.error ?? 'AgentKit signature verification failed',
        );
      }

      const humanId = await this.dependencies.agentBook.lookupHuman(signature.address);
      if (!humanId) {
        throw new HumanBackedAuthorizationError(
          'agent_not_human_backed',
          'The Agent wallet is not registered to a verified human in AgentBook',
        );
      }

      return {
        provider: 'world_agentkit',
        agentAddress: signature.address.toLowerCase(),
        anonymousHumanRefHash: createHmac('sha256', this.environment.humanReferenceSecret)
          .update(humanId)
          .digest('hex'),
        nonce: payload.nonce,
      };
    } catch (error) {
      if (error instanceof HumanBackedAuthorizationError) {
        throw error;
      }

      throw new HumanBackedAuthorizationError(
        'invalid_agentkit_proof',
        error instanceof Error ? error.message : 'AgentKit proof could not be verified',
      );
    }
  }
}
