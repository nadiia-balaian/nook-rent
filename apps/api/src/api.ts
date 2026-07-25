import Fastify, { type FastifyInstance } from 'fastify';

export interface CreateApiOptions {
  logger?: boolean;
}

export function createApi(options: CreateApiOptions = {}): FastifyInstance {
  const app = Fastify({
    logger: options.logger ?? false,
  });

  app.get('/health', () => ({
    service: 'nook-api',
    status: 'ok',
  }));

  return app;
}
