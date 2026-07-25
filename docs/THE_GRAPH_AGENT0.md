# The Graph Agent0 integration

## What The Graph controls

The Graph is a live, load-bearing authorization source for protected Guest
Agent actions:

```text
World verifies a human-backed signing Agent
  -> Nook.rent queries Agent0 through The Graph
  -> the signing wallet must match an Agent wallet, owner, or operator
  -> the registration must be active
  -> it must advertise nook.rent:reservation-hold
  -> only then may Nook.rent create the Reservation Hold
```

Public Listing search and Booking Quotes remain available without The Graph.
The protected hold fails closed when the provider is unavailable, the response
is invalid, or the registration requirement is not met.

The Graph does not calculate Rental Reputation. The browser receives only the
named provider, network, Subgraph ID, wallet-binding type, and successful
capability result. It never receives the Graph API key, raw response, or signing
wallet.

## Selected live source

Nook.rent uses the Agent0 ERC-8004 Subgraph on Base Sepolia:

| Setting          | Value                                          |
| ---------------- | ---------------------------------------------- |
| Network          | Base Sepolia                                   |
| Chain ID         | `84532`                                        |
| Agent0 Subgraph  | `4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u` |
| Required signal  | active Agent registration                      |
| Required binding | signing wallet, registry owner, or operator    |
| Required ability | `nook.rent:reservation-hold`                   |
| Query cache      | 15 seconds by default                          |
| Provider timeout | 3.5 seconds by default                         |

The endpoint pattern is:

```text
https://gateway.thegraph.com/api/<API_KEY>/subgraphs/id/<SUBGRAPH_ID>
```

The key is server-only and is never written to evidence or logs.

Official references:

- [The Graph Agent0 documentation](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/)
- [Agent0 Subgraph in Graph Explorer](https://thegraph.com/explorer/subgraphs/4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u?chain=arbitrum-one&view=About)
- [Base RPC documentation](https://docs.base.org/base-chain/api-reference/rpc-overview)

## API configuration

Create a free Subgraph Studio API key and set:

```text
THE_GRAPH_API_KEY=<server-only Graph API key>
THE_GRAPH_AGENT0_SUBGRAPH_ID=4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u
THE_GRAPH_AGENT0_CHAIN_ID=84532
THE_GRAPH_REQUIRED_CAPABILITY=nook.rent:reservation-hold
```

The gateway URL, timeout, and cache values in `.env.example` are optional
defaults.

## One-time Agent0 registration

Use the same dedicated EVM wallet already registered as the World Guest Agent.
That makes the human-backed AgentKit signer and the Agent0 signing wallet the
same public address. Do not create or expose another private key.

Before registration:

1. review the committed
   `apps/web/public/.well-known/nook-agent-registration.json` document and make
   sure its service endpoint is the deployed protected API URL;
2. fund the Agent wallet with a small amount of Base Sepolia ETH for gas;
3. keep `WORLD_AGENT_WALLET_PRIVATE_KEY` in the local root `.env`;
4. confirm the Base Sepolia RPC and registry address from `.env.example`.

The helper validates the document, embeds its compact JSON as an ERC-8004
`data:application/json;base64` URI, checks the chain, wallet balance, and
existing registry balance, then registers it. The on-chain data URI is
intentional: the Agent0 Subgraph can index registration fields from IPFS or an
on-chain JSON data URI, while an arbitrary HTTPS document is not an indexable
file source. The public web copy remains useful for human inspection.

The helper refuses to create a second Agent owned by the wallet.

Run the write deliberately:

```text
THE_GRAPH_AGENT0_REGISTER_CONFIRM=register-nook-agent-base-sepolia pnpm graph:agent-register
```

This sends one Base Sepolia transaction. Its safe output contains the Agent ID,
public signing wallet, metadata URI type, transaction hash, and explorer URL,
never the private key or full embedded URI.

## Verify indexing

After The Graph indexes the registration, run:

```text
pnpm graph:agent-status -- \
  --agent-address <same public World Agent address>
```

The command exits successfully only when the registration is present, active,
and advertises `nook.rent:reservation-hold`. A short indexing delay after the
transaction is normal.

Then create a fresh Booking Quote and use the existing World Agent command:

```text
pnpm world:hold -- \
  --quote-id <booking-quote-uuid> \
  --idempotency-key graph-live-hold-001
```

Expected result:

1. World completes the `402` signed challenge;
2. The Graph returns the same Agent registration live;
3. Nook.rent verifies the active booking capability;
4. the API creates the hold and returns safe `onchainSignal` evidence.

## Evidence to capture

Record only:

- date and Base Sepolia network;
- Agent0 Agent ID and registration transaction link;
- Graph Subgraph ID and endpoint pattern without the API key;
- safe output of `graph:agent-status`;
- successful protected hold showing the named Graph signal;
- commit SHA used for the run.

Never record the Graph API key, private key, signed AgentKit header, World human
identifier, nonce, database URL, or raw provider response.
