import { describe, expect, it } from 'vitest';

import { parseOptionalPoapEnvironment } from '../src/environment.js';

describe('POAP environment', () => {
  it('keeps wallet evidence optional when POAP_SOURCE is not enabled', () => {
    expect(parseOptionalPoapEnvironment({})).toBeUndefined();
    expect(
      parseOptionalPoapEnvironment({
        POAP_SOURCE: 'disabled',
        WALLET_CHALLENGE_SECRET: 'unused-test-secret-that-is-at-least-32-characters',
      }),
    ).toBeUndefined();
  });

  it('requires only a challenge secret for public Compass reads', () => {
    expect(
      parseOptionalPoapEnvironment({
        POAP_SOURCE: 'compass',
        WALLET_CHALLENGE_SECRET: 'test-only-secret-that-is-at-least-32-characters',
      }),
    ).toEqual({
      source: 'compass',
      challengeSecret: 'test-only-secret-that-is-at-least-32-characters',
      challengeTtlSeconds: 300,
    });
  });

  it('rejects a short challenge secret', () => {
    expect(() =>
      parseOptionalPoapEnvironment({
        POAP_SOURCE: 'compass',
        WALLET_CHALLENGE_SECRET: 'too-short',
      }),
    ).toThrow();
  });
});
