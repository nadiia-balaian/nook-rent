import { createWorldGuestAgentClient, parseWorldGuestAgentEnvironment } from './index.js';

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

const environment = parseWorldGuestAgentEnvironment(process.env);
const client = createWorldGuestAgentClient({
  privateKey: environment.agentWalletPrivateKey,
  resourceUri: environment.resourceUri,
});
const response = await client.createReservationHold({
  quoteId: option('--quote-id'),
  idempotencyKey: option('--idempotency-key'),
});
const payload: unknown = await response.json();

process.stdout.write(`${JSON.stringify({ status: response.status, payload }, null, 2)}\n`);

if (!response.ok) {
  process.exitCode = 1;
}
