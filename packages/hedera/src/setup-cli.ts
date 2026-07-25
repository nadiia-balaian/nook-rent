import { createHederaClient, parseHederaSetupEnvironment } from './environment.js';
import { setupHederaResources } from './setup.js';

const confirmation = process.env.HEDERA_SETUP_CONFIRM;

if (confirmation !== 'create-nook-testnet-resources') {
  throw new Error(
    'Set HEDERA_SETUP_CONFIRM=create-nook-testnet-resources to authorize Testnet resource creation',
  );
}

const environment = parseHederaSetupEnvironment(process.env);
const client = createHederaClient(environment);

try {
  const result = await setupHederaResources(environment, client, (progress) => {
    console.log(JSON.stringify({ progress }));
  });

  console.log(JSON.stringify({ result }, null, 2));
} finally {
  client.close();
}
