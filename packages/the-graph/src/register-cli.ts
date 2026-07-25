import { readFile } from 'node:fs/promises';

import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  parseEventLogs,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';

import { parseAgent0RegistrationEnvironment, validateAgent0RegistrationDocument } from './index.js';

const identityRegistryAbi = parseAbi([
  'function register(string agentURI) returns (uint256 agentId)',
  'function balanceOf(address owner) view returns (uint256)',
  'event Registered(uint256 indexed agentId, string agentURI, address indexed owner)',
]);

const environment = parseAgent0RegistrationEnvironment(process.env);
const registrationDocumentUrl = new URL(
  '../../../apps/web/public/.well-known/nook-agent-registration.json',
  import.meta.url,
);
const registrationDocumentValue: unknown = JSON.parse(
  await readFile(registrationDocumentUrl, 'utf8'),
);
const registrationDocument = validateAgent0RegistrationDocument(registrationDocumentValue);
const registrationUri = `data:application/json;base64,${Buffer.from(
  JSON.stringify(registrationDocumentValue),
).toString('base64')}`;
const account = privateKeyToAccount(environment.privateKey);
const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(environment.rpcUrl),
});
const walletClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http(environment.rpcUrl),
});
const chainId = await publicClient.getChainId();

if (chainId !== environment.chainId) {
  throw new Error(`RPC returned chain ${chainId}; expected Base Sepolia ${environment.chainId}`);
}

const [nativeBalance, existingAgentCount] = await Promise.all([
  publicClient.getBalance({ address: account.address }),
  publicClient.readContract({
    address: environment.registryAddress,
    abi: identityRegistryAbi,
    functionName: 'balanceOf',
    args: [account.address],
  }),
]);

if (nativeBalance === 0n) {
  throw new Error('The Agent wallet needs Base Sepolia ETH before Agent0 registration');
}
if (existingAgentCount > 0n) {
  throw new Error(
    'The Agent wallet already owns an Agent0 registration; refusing to create a duplicate',
  );
}

const { request } = await publicClient.simulateContract({
  account,
  address: environment.registryAddress,
  abi: identityRegistryAbi,
  functionName: 'register',
  args: [registrationUri],
});
const transactionHash = await walletClient.writeContract(request);
const receipt = await publicClient.waitForTransactionReceipt({
  hash: transactionHash,
  confirmations: 1,
  timeout: 180_000,
});

if (receipt.status !== 'success') {
  throw new Error('Agent0 registration transaction reverted');
}

const registrationEvent = parseEventLogs({
  abi: identityRegistryAbi,
  eventName: 'Registered',
  logs: receipt.logs,
  strict: true,
})[0];

if (!registrationEvent) {
  throw new Error('Agent0 registration event was not found');
}
if (getAddress(registrationEvent.args.owner) !== getAddress(account.address)) {
  throw new Error('Agent0 registration owner does not match the signing wallet');
}
if (registrationEvent.args.agentURI !== registrationUri) {
  throw new Error('Agent0 registration event contains unexpected metadata');
}

process.stdout.write(
  `${JSON.stringify(
    {
      status: 'registered',
      network: 'base-sepolia',
      chainId,
      agentId: `${chainId}:${registrationEvent.args.agentId}`,
      signingWallet: account.address,
      registrationUriType: 'data:application/json;base64',
      capability: registrationDocument.requiredCapability,
      transactionHash,
      explorerUrl: `https://sepolia.basescan.org/tx/${transactionHash}`,
    },
    null,
    2,
  )}\n`,
);
