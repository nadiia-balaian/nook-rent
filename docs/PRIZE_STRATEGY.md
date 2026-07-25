# Nook.rent prize strategy

Status: target matrix for ETHGlobal Lisbon 2026

## Combined story

> Nook.rent lets a human-backed Guest Agent find a temporary home, prove its live
> Agent identity, satisfy transparent booking policy, reserve scarce dates, and
> lock a real deposit on Hedera. Completed rental behavior becomes portable
> Rental Reputation for the next stay.

Each sponsor controls a different boundary:

```text
The Graph
  -> live Agent identity, wallet/operator, and capabilities

World
  -> human-backed authorization and anti-abuse

Nook.rent
  -> availability, approval, price, and Rental Reputation

Hedera
  -> escrow, payment, scheduling, public evidence, and read-back
```

## Hedera

Official page:
[ETHGlobal Lisbon 2026 Hedera prizes](https://ethglobal.com/events/lisbon2026/prizes/hedera)

### Primary: AI & Agentic Payments on Hedera

Target evidence:

- Guest Agent triggers at least one real HTS financial operation on Testnet;
- all financial parameters come from stored Booking terms;
- the payment is idempotent and recoverable;
- demo video shows the Agent action and HashScan result;
- public repository explains the complete flow.

Enhancements already aligned with Nook.rent:

- HTS test token;
- Scheduled Transactions where useful;
- HCS payment and Booking audit trail;
- human-backed Agent identity;
- multi-Agent Host and Guest workflow.

### Secondary: No Solidity Allowed

Target evidence:

- use the Hedera SDK directly;
- demonstrate at least two native services;
- show a coherent end-to-end product;
- use Mirror Node evidence;
- keep the baseline free of Solidity.

Nook.rent intends to demonstrate HTS, HCS, Schedule Service, and Mirror Node.

### Not targeted

- Tokenization: the temporary-stay product is not an asset-tokenization
  lifecycle.
- Cross-chain automation: it would add a second settlement path without helping
  the core Booking flow.

## World

Official page:
[ETHGlobal Lisbon 2026 World prizes](https://ethglobal.com/events/lisbon2026/prizes/world)

### Primary: AgentKit New Use Cases

The qualifying product difference is not login. A protected Nook.rent service
distinguishes:

- a bot or unregistered Agent that may browse;
- an Agent acting for a real, unique human that may reserve scarce dates and
  initiate a Booking deposit.

Required evidence:

- meaningful AgentKit integration;
- Agent registered in AgentBook;
- real human-backed verification;
- one rejected unverified-agent request;
- one successful verified-agent Booking flow;
- persistent replay protection;
- no raw identity proof in application logs or HCS.

This is a new housing-access and scarce-inventory authorization workflow, not an
Agent reputation or content-generation use case.

### Optional beta tracks

Selfie Check and Identity Check are not baseline targets. They require meaningful
use, a working end-to-end flow, and both developer and user testing
documentation. Add one only if a necessary product rule emerges and the core
flow is already stable.

## The Graph

Official page:
[ETHGlobal Lisbon 2026 The Graph prizes](https://ethglobal.com/events/lisbon2026/prizes/the-graph)

### Primary: Best AI Use Case of The Graph

### Continuity: Best AI Use Case of The Graph

Target evidence:

- The Graph is a load-bearing source of live blockchain data;
- Nook.rent queries through a Graph provider;
- the Agent reasons or acts on the returned data;
- mocked or static responses are not used in the submitted demonstration;
- the public repository identifies the Subgraph and endpoint pattern;
- the Graph-specific integration is built during the event;
- submission includes a 2–4 minute video.

Recommended live data:

- Agent0 ERC-8004 Agent registration;
- owner or operator wallet;
- active state;
- advertised MCP/A2A or Nook.rent booking capability;
- optional explicitly named ENS signal.

The Graph does not calculate Rental Reputation.

The existing Agent0 Subgraph is documented at
[The Graph Agent0 documentation](https://thegraph.com/docs/en/subgraphs/existing-subgraphs/agent0/).
The selected deployment is Base Sepolia (`84532`), Subgraph ID
`4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u`. Nook.rent requires an active
registration bound to the human-backed signing wallet and the named
`nook.rent:reservation-hold` capability.

### Not targeted

- AI Tooling: Nook.rent is an end-user application, not reusable Graph developer
  infrastructure.
- Composable or Standardized Graph Products: one Agent identity query does not
  satisfy the required composition or standards breadth by itself.

## Sponsor evidence checklist

| Evidence                          | Local test           | Live demonstration         |
| --------------------------------- | -------------------- | -------------------------- |
| Deterministic 3–90-night quote    | Required             | Required                   |
| Atomic date hold                  | Required             | Required                   |
| World rejects unverified Agent    | Contract test        | Required                   |
| World accepts human-backed Agent  | Adapter test         | Required                   |
| The Graph live Agent registration | Mocked contract test | Required                   |
| Hedera Testnet deposit            | Workflow test        | Required                   |
| Mirror Node read-back             | Adapter test         | Required                   |
| HCS pseudonymous event            | Envelope test        | Required                   |
| Duplicate request is idempotent   | Required             | Demonstrate if time allows |
| Newcomer manual-review path       | Required             | Required                   |

## Demo order

1. Host completes World ID Member verification and publishes a Listing with
   dates and automatic-approval policy.
2. Guest completes World ID Member verification and connects the Guest Agent.
3. Guest Agent searches for a valid 3–90-night stay.
4. Guest authorizes one Agent Mandate to secure the top valid match.
5. Unverified Member or Agent attempts a hold and is denied.
6. World proves the Agent is human-backed.
7. The Graph returns its live Agent registration and capability.
8. Nook.rent atomically holds the dates.
9. Stored policy uses Rental Reputation to auto-approve the experienced Guest.
10. Guest funds the real Hedera Testnet deposit.
11. Booking is confirmed with Mirror Node and HCS evidence.
12. A Newcomer request demonstrates the fair Host-review path.

One story should prove all three integrations without separate disconnected
demos.
