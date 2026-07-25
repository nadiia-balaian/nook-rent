import { parseServerEnvironment } from '@nook-rent/config';

import { createApi } from './api.js';

const environment = parseServerEnvironment(process.env);
const app = createApi({
  logger: environment.nodeEnvironment !== 'test',
});

async function start(): Promise<void> {
  try {
    await app.listen({
      host: environment.apiHost,
      port: environment.apiPort,
    });
  } catch (error) {
    app.log.error(error);
    process.exitCode = 1;
  }
}

void start();
