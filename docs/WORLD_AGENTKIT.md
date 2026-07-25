# World AgentKit authorization

## What World controls

World does not create Rental Reputation and is not generic sign-in. It protects
the scarce action in the Guest flow:

```text
public Listing search
  -> public deterministic quote
  -> 402 AgentKit challenge
  -> Guest Agent signs the challenge
  -> server verifies the signed message
  -> AgentBook confirms that the Agent is human-backed
  -> database consumes the nonce and enforces one active hold per human
  -> Reservation Hold is created
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

## Implemented locally

- official `@worldcoin/agentkit` server and Guest Agent client;
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
- local protocol, API, and real PostgreSQL integration tests.

The fourth migration is intentionally not applied to hosted Supabase until that
external write is explicitly approved.

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

The API verifier needs the resource URI and human-reference secret. The Agent
wallet key belongs only in the Guest Agent runtime or a local demo environment;
never expose it to the web application.

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

## Local proof flow

After the fourth migration is applied to the intended database, start the API
and create a fresh Booking Quote through the web or API. Then let the registered
Guest Agent place the protected hold:

```bash
pnpm world:hold -- \
  --quote-id <booking-quote-uuid> \
  --idempotency-key world-demo-hold-001
```

Expected behavior:

1. the first request receives a `402` AgentKit challenge;
2. the official AgentKit client signs it and retries automatically;
3. the API returns `201` with `authorization.humanBacked: true`;
4. retrying the same idempotency key returns the same Hold;
5. reusing the proof nonce for a different request is rejected;
6. the same verified human cannot keep a second active Hold.

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
