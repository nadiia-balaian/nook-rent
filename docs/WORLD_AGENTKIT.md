# World AgentKit authorization

## What World controls

World does not create Rental Reputation and is not generic sign-in. It protects
the scarce action in the Guest flow:

```text
direct Guest World ID Member verification
  -> public Listing search
  -> Guest authorizes one bounded secure-and-fund mandate
  -> public deterministic quote
  -> 402 AgentKit challenge
  -> Guest Agent signs the challenge
  -> server verifies the signed message
  -> AgentBook confirms that the Agent is human-backed
  -> database consumes the nonce and enforces one active hold per human
  -> Reservation Hold is created
  -> separate Agent Payment Mandate waits for deterministic approval
```

The browser and HCS never receive the Agent address, World human identifier,
raw proof, nonce, or stored human-reference hash. A successful API response
contains only:

```json
{
  "authorization": {
    "provider": "world_agentkit",
    "humanBacked": true
  }
}
```

The guided Guest flow first completes direct World ID Member verification, then
calls `POST /v1/agents/guest/world-connection`. This performs a live AgentBook
lookup and a live The Graph Agent0 capability check. It returns only safe
public verification states and network labels. The Guest may later call
`POST /v1/agents/guest/secure-match` to let the Agent select the top valid match,
create its deterministic quote, request one hold, and create a separate bounded
Agent Payment Mandate. The manual path calls
`POST /v1/agents/guest/reservation-holds`. The server-side Guest Agent then
calls the protected Reservation Hold resource through the official AgentKit
client, handles the `402` challenge, signs it with the server-only Agent wallet,
and retries. World authorizes the protected Agent action; Hedera settlement
uses the separate mandate and stored Booking terms. The browser never signs or
receives Agent or Hedera wallet material.

## Implemented

- official `@worldcoin/agentkit` server and Guest Agent client;
- direct Guest Member verification before Agent connection or protected hold;
- explicit UI connection step backed by live AgentBook and Agent0 checks;
- server-side Guest Agent bridge for the browser demo flow;
- bounded, idempotent secure-and-fund Agent Mandate;
- five-minute World Chain challenge bound to the Reservation Hold URL;
- signed-message validation and signature verification;
- AgentBook lookup on World Chain;
- server-side HMAC of the anonymous AgentBook human identifier;
- persistent nonce consumption;
- one concurrent active hold per anonymous verified human;
- Agent-to-Guest Profile binding;
- atomic authorization and Reservation Hold creation;
- explicit missing-proof, invalid-proof, unverified-Agent, replay, and hold-limit
  responses;
- local protocol, API, and real PostgreSQL integration tests;
- hosted authorization and idempotent-retry migrations.

## One-time setup

Use a separate EVM Agent wallet for World. Do not reuse the Hedera operator or
escrow key.

Set these values in the root `.env`:

```text
WORLD_AGENTKIT_RESOURCE_URI=http://localhost:3100/v1/reservation-holds
WORLD_HUMAN_REFERENCE_SECRET=<at least 32 random characters>
WORLD_CHAIN_RPC_URL=<optional World Chain RPC URL>
WORLD_AGENT_WALLET_PRIVATE_KEY=<0x-prefixed Agent wallet private key>
```

Leave `WORLD_CHAIN_RPC_URL` blank to use the default public World Chain RPC.

The API verifier needs the resource URI and human-reference secret. The Agent
wallet key belongs only in the server-side Guest Agent runtime; never expose it
to the web application or any `VITE_` environment variable.

For the deployed API, `WORLD_AGENTKIT_RESOURCE_URI` must be the exact public
Reservation Hold URL, for example:

```text
https://api.nook.rent/v1/reservation-holds
```

Print only the public Agent address:

```bash
pnpm world:agent-address
```

Register that address through the official AgentKit CLI and complete the World
App verification:

```bash
npx @worldcoin/agentkit-cli register <agent-address>
npx @worldcoin/agentkit-cli status <agent-address>
```

Registration is an external World operation and must be run deliberately by the
demo owner. See the official
[AgentKit integration guide](https://docs.world.org/agents/agent-kit/integrate)
and [SDK reference](https://docs.world.org/agents/agent-kit/sdk-reference).

## Proof flow

After the migrations are applied to the intended database, start the API and
create a fresh Booking Quote through the web or API. Then let the registered
Guest Agent place the protected hold:

```bash
pnpm world:hold -- \
  --quote-id <booking-quote-uuid> \
  --idempotency-key world-demo-hold-001
```

Expected behavior:

1. the verification screen confirms the configured Agent through AgentBook and
   checks its Nook capability through The Graph;
2. the first protected request receives a `402` AgentKit challenge;
3. the official AgentKit client signs it and retries automatically;
4. the API returns `201` with `authorization.humanBacked: true`;
5. retrying the same idempotency key returns the same Hold;
6. reusing the proof nonce for a different request is rejected;
7. the same verified human cannot keep a second active Hold.

## Live exit evidence

Verified on 2026-07-25 against AgentBook on World Chain:

- an unsigned Reservation Hold request returned an AgentKit `402` challenge;
- the registered Guest Agent signed the challenge and created the Hold;
- the API returned only `provider: world_agentkit` and `humanBacked: true`;
- the experienced Guest was automatically approved;
- a retry with the same idempotency key and a fresh challenge nonce returned
  the original Hold and Booking;
- a second concurrent Hold from the same verified human was rejected with
  `human_active_hold_limit`.

No private key, World human identifier, signed header, nonce, database URL, or
human-reference hash is recorded.

This evidence predates Agent Payment Mandates. A fresh combined World and
Hedera run is still required to prove the autonomous settlement path.

## Evidence to capture

For the hackathon evidence file, record only:

- date;
- protected application action;
- success or normalized rejection;
- AgentKit and AgentBook network;
- commit SHA;
- screenshots with wallet addresses and proof material redacted.

Never record the Agent private key, World human identifier, signed header,
nonce, database URL, or human-reference hash.
