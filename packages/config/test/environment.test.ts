import { describe, expect, it } from 'vitest';

import { parseServerEnvironment } from '../src/index.js';

describe('parseServerEnvironment', () => {
  it('provides safe local defaults', () => {
    expect(parseServerEnvironment({})).toEqual({
      nodeEnvironment: 'development',
      apiHost: '0.0.0.0',
      apiPort: 3100,
      allowedOrigins: [],
    });
  });

  it('parses ports and comma-separated origins', () => {
    expect(
      parseServerEnvironment({
        NODE_ENV: 'production',
        API_HOST: '127.0.0.1',
        API_PORT: '4100',
        ALLOWED_ORIGINS: 'https://nook.rent, https://demo.nook.rent',
      }),
    ).toEqual({
      nodeEnvironment: 'production',
      apiHost: '127.0.0.1',
      apiPort: 4100,
      allowedOrigins: ['https://nook.rent', 'https://demo.nook.rent'],
    });
  });

  it('rejects invalid ports', () => {
    expect(() =>
      parseServerEnvironment({
        API_PORT: '70000',
      }),
    ).toThrow();
  });
});
