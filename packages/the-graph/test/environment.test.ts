import { describe, expect, it } from 'vitest';

import {
  AGENT0_REGISTRATION_CONFIRMATION,
  BASE_SEPOLIA_AGENT0_SUBGRAPH_ID,
  DEFAULT_AGENT_CAPABILITY,
  ETHEREUM_MAINNET_ENS_SUBGRAPH_ID,
  parseAgent0RegistrationEnvironment,
  parseOptionalGraphEnvironment,
} from '../src/environment.js';

describe('The Graph environment', () => {
  it('keeps the integration optional when no Graph values are present', () => {
    expect(parseOptionalGraphEnvironment({})).toBeUndefined();
    expect(
      parseOptionalGraphEnvironment({
        THE_GRAPH_AGENT0_CHAIN_ID: '84532',
        THE_GRAPH_REQUIRED_CAPABILITY: DEFAULT_AGENT_CAPABILITY,
      }),
    ).toBeUndefined();
  });

  it('requires both a gateway API key and Agent0 Subgraph ID once enabled', () => {
    expect(() =>
      parseOptionalGraphEnvironment({
        THE_GRAPH_API_KEY: 'test-key',
      }),
    ).toThrow();
  });

  it('parses the official Base Sepolia defaults without exposing the API key in a URL', () => {
    expect(
      parseOptionalGraphEnvironment({
        THE_GRAPH_API_KEY: 'test-key',
        THE_GRAPH_AGENT0_SUBGRAPH_ID: BASE_SEPOLIA_AGENT0_SUBGRAPH_ID,
        THE_GRAPH_GATEWAY_URL: '   ',
      }),
    ).toEqual({
      apiKey: 'test-key',
      subgraphId: BASE_SEPOLIA_AGENT0_SUBGRAPH_ID,
      ensSubgraphId: ETHEREUM_MAINNET_ENS_SUBGRAPH_ID,
      chainId: 84_532,
      network: 'base-sepolia',
      requiredCapability: DEFAULT_AGENT_CAPABILITY,
      gatewayUrl: 'https://gateway.thegraph.com/api',
      timeoutMs: 3_500,
      cacheTtlMs: 15_000,
    });
  });

  it('requires explicit confirmation before enabling an Agent0 registration write', () => {
    const values = {
      THE_GRAPH_AGENT0_CHAIN_ID: '84532',
      THE_GRAPH_AGENT0_RPC_URL: 'https://sepolia.base.org',
      THE_GRAPH_AGENT0_REGISTER_CONFIRM: AGENT0_REGISTRATION_CONFIRMATION,
      WORLD_AGENT_WALLET_PRIVATE_KEY: `0x${'1'.repeat(64)}`,
    };

    expect(parseAgent0RegistrationEnvironment(values)).toMatchObject({
      chainId: 84_532,
      rpcUrl: 'https://sepolia.base.org',
    });
    expect(() =>
      parseAgent0RegistrationEnvironment({
        ...values,
        THE_GRAPH_AGENT0_REGISTER_CONFIRM: '',
      }),
    ).toThrow();
  });
});
