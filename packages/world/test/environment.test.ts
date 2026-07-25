import { describe, expect, it } from 'vitest';

import {
  parseOptionalWorldGuestAgentEnvironment,
  parseOptionalWorldIdEnvironment,
  parseOptionalWorldVerifierEnvironment,
  parseWorldAgentWalletEnvironment,
  parseWorldGuestAgentEnvironment,
} from '../src/environment.js';

describe('World environment', () => {
  it('keeps the server-side Guest Agent optional when no wallet key is configured', () => {
    expect(
      parseOptionalWorldGuestAgentEnvironment({
        WORLD_AGENTKIT_RESOURCE_URI: 'http://localhost:3100/v1/reservation-holds',
        WORLD_HUMAN_REFERENCE_SECRET: 'test-only-secret-with-at-least-32-characters',
      }),
    ).toBeUndefined();
  });

  it('keeps World ID optional and requires a complete configuration when enabled', () => {
    expect(parseOptionalWorldIdEnvironment({})).toBeUndefined();
    expect(
      parseOptionalWorldIdEnvironment({
        WORLD_ID_APP_ID: 'app_nook_test',
        WORLD_ID_RP_ID: 'rp_nook_test',
        WORLD_ID_SIGNING_KEY: `0x${'1'.repeat(64)}`,
        WORLD_ID_ACTION: 'nook-member-onboarding',
        WORLD_ID_ENVIRONMENT: 'staging',
      }),
    ).toEqual({
      appId: 'app_nook_test',
      rpId: 'rp_nook_test',
      signingKey: `0x${'1'.repeat(64)}`,
      action: 'nook-member-onboarding',
      environment: 'staging',
    });
  });

  it('keeps the verifier optional when no World values are present', () => {
    expect(parseOptionalWorldVerifierEnvironment({})).toBeUndefined();
  });

  it('requires a complete verifier configuration once World is enabled', () => {
    expect(() =>
      parseOptionalWorldVerifierEnvironment({
        WORLD_AGENTKIT_RESOURCE_URI: 'http://localhost:3100/v1/reservation-holds',
      }),
    ).toThrow();
  });

  it('uses the default World Chain RPC when the optional value is blank', () => {
    const environment = {
      WORLD_AGENTKIT_RESOURCE_URI: 'http://localhost:3100/v1/reservation-holds',
      WORLD_HUMAN_REFERENCE_SECRET: 'test-only-secret-with-at-least-32-characters',
      WORLD_CHAIN_RPC_URL: '   ',
      WORLD_AGENT_WALLET_PRIVATE_KEY: `0x${'1'.repeat(64)}`,
    };

    expect(parseOptionalWorldVerifierEnvironment(environment)).toEqual({
      resourceUri: environment.WORLD_AGENTKIT_RESOURCE_URI,
      humanReferenceSecret: environment.WORLD_HUMAN_REFERENCE_SECRET,
    });
    expect(parseWorldGuestAgentEnvironment(environment)).toEqual({
      resourceUri: environment.WORLD_AGENTKIT_RESOURCE_URI,
      humanReferenceSecret: environment.WORLD_HUMAN_REFERENCE_SECRET,
      agentWalletPrivateKey: environment.WORLD_AGENT_WALLET_PRIVATE_KEY,
    });
  });

  it('parses verifier and Guest Agent settings without transforming private material', () => {
    const environment = {
      WORLD_AGENTKIT_RESOURCE_URI: 'http://localhost:3100/v1/reservation-holds',
      WORLD_HUMAN_REFERENCE_SECRET: 'test-only-secret-with-at-least-32-characters',
      WORLD_CHAIN_RPC_URL: 'https://worldchain-mainnet.g.alchemy.com/public',
      WORLD_AGENT_WALLET_PRIVATE_KEY: `0x${'1'.repeat(64)}`,
    };

    expect(parseOptionalWorldVerifierEnvironment(environment)).toEqual({
      resourceUri: environment.WORLD_AGENTKIT_RESOURCE_URI,
      humanReferenceSecret: environment.WORLD_HUMAN_REFERENCE_SECRET,
      rpcUrl: environment.WORLD_CHAIN_RPC_URL,
    });
    expect(parseWorldGuestAgentEnvironment(environment)).toEqual({
      resourceUri: environment.WORLD_AGENTKIT_RESOURCE_URI,
      humanReferenceSecret: environment.WORLD_HUMAN_REFERENCE_SECRET,
      rpcUrl: environment.WORLD_CHAIN_RPC_URL,
      agentWalletPrivateKey: environment.WORLD_AGENT_WALLET_PRIVATE_KEY,
    });
    expect(parseWorldAgentWalletEnvironment(environment)).toEqual({
      agentWalletPrivateKey: environment.WORLD_AGENT_WALLET_PRIVATE_KEY,
    });
  });
});
