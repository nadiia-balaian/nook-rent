import { describe, expect, it } from 'vitest';

import { parseOptionalAiEnvironment } from '../src/index.js';

describe('AI environment', () => {
  it('keeps AI optional when no API key is configured', () => {
    expect(parseOptionalAiEnvironment({})).toBeUndefined();
  });

  it('uses the constrained Phase 8 defaults', () => {
    expect(parseOptionalAiEnvironment({ OPENAI_API_KEY: 'test-key' })).toEqual({
      apiKey: 'test-key',
      model: 'gpt-5.6-sol',
      timeoutMilliseconds: 8_000,
    });
  });
});
