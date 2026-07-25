import { Agent0GraphClient, parseOptionalGraphEnvironment } from './index.js';

function option(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;

  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

const environment = parseOptionalGraphEnvironment(process.env);
if (!environment) {
  throw new Error('The Graph environment is required for a live Agent0 query');
}

const client = new Agent0GraphClient(environment);
const signal = await client.getAgentRegistration(option('--agent-address'));

process.stdout.write(
  `${JSON.stringify(
    signal
      ? {
          registered: true,
          active: signal.active,
          binding: signal.binding,
          capabilities: signal.capabilities,
          requiredCapability: environment.requiredCapability,
          requiredCapabilityPresent: signal.capabilities.includes(environment.requiredCapability),
          source: {
            provider: 'the_graph',
            subgraph: 'agent0',
            network: signal.network,
            chainId: signal.chainId,
            subgraphId: signal.subgraphId,
          },
        }
      : {
          registered: false,
          requiredCapability: environment.requiredCapability,
          source: {
            provider: 'the_graph',
            subgraph: 'agent0',
            network: environment.network,
            chainId: environment.chainId,
            subgraphId: environment.subgraphId,
          },
        },
    null,
    2,
  )}\n`,
);

if (!signal || !signal.active || !signal.capabilities.includes(environment.requiredCapability)) {
  process.exitCode = 1;
}
