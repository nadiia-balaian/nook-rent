import { afterEach, describe, expect, it } from 'vitest';

import { createApi } from '../src/api.js';

const applications: ReturnType<typeof createApi>[] = [];

afterEach(async () => {
  await Promise.all(applications.splice(0).map(async (application) => application.close()));
});

describe('Nook API', () => {
  it('reports service health without external dependencies', async () => {
    const application = createApi();
    applications.push(application);

    const response = await application.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      service: 'nook-api',
      status: 'ok',
    });
  });
});
