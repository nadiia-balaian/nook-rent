import { parseOptionalHederaEnvironment } from './environment.js';
import { HederaMirrorNode } from './mirror-node.js';
import { runHederaPreflight } from './preflight.js';

const environment = parseOptionalHederaEnvironment(process.env);

if (!environment) {
  throw new Error('Hedera environment is not configured');
}

const result = await runHederaPreflight(
  environment,
  new HederaMirrorNode(environment.mirrorNodeUrl),
);

console.log(JSON.stringify(result, null, 2));
