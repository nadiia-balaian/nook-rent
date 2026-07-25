import { privateKeyToAccount } from 'viem/accounts';

import { parseWorldAgentWalletEnvironment } from './environment.js';

const environment = parseWorldAgentWalletEnvironment(process.env);
const account = privateKeyToAccount(environment.agentWalletPrivateKey);

process.stdout.write(`${account.address}\n`);
