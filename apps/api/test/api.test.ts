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
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });

  it('reports that readiness is unavailable without a database adapter', async () => {
    const application = createApi();
    applications.push(application);

    const response = await application.inject({
      method: 'GET',
      url: '/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      service: 'nook-api',
      status: 'not_ready',
    });
  });

  it('uses a stable error envelope for unknown routes', async () => {
    const application = createApi();
    applications.push(application);

    const response = await application.inject({
      method: 'GET',
      url: '/does-not-exist',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: 'route_not_found',
        message: 'The requested API route does not exist',
      },
    });
    expect(response.json().error.requestId).toBeTypeOf('string');
  });
});
