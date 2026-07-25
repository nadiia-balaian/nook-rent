# Nook.rent

Nook.rent is a marketplace for trusted temporary stays. Human-backed agents help
hosts create listings and help guests find suitable homes, while transparent
booking rules protect availability, approval, and payment.

The hackathon product supports stays from **3 to 90 nights** with nightly pricing,
real Testnet settlement evidence, and two approval paths:

- qualified guests can be approved automatically under a host-defined policy;
- newcomers and guests who do not meet that policy are sent to host review.

## Core flow

```text
host describes a home
  -> host agent prepares a listing
  -> host confirms price, dates, and approval policy
  -> guest agent searches available listings
  -> World verifies that the agent is human-backed
  -> The Graph verifies live agent and onchain signals
  -> Nook.rent creates an expiring reservation hold
  -> policy selects automatic approval or host review
  -> Hedera locks the deposit and records verifiable evidence
  -> booking is confirmed
  -> checkout and verified rental behavior update Rental Reputation
```

## Sponsor responsibilities

- **Hedera:** real Testnet escrow, booking payment, scheduled operations, HCS
  evidence, and Mirror Node verification.
- **World:** human-backed agent authorization before scarce dates or funds can be
  controlled.
- **The Graph:** live agent registration, wallet binding, capabilities, and
  explicitly selected onchain signals.

These responsibilities are deliberately separate. World verification is not
Rental Reputation, and public wallet activity is not treated as proof of good
rental behavior.

## Repository status

Phases 1–7 are complete and Phase 8 is implemented locally. Hedera, World
AgentKit, and The Graph have produced verified live evidence; the constrained
OpenAI path is ready for one opt-in live smoke test:

- `pnpm` TypeScript monorepo and shared quality gate;
- Fastify API shell with a tested health endpoint;
- worker and Vite/React application shells;
- deterministic 3–90-night validation;
- exact Booking Quote and deposit arithmetic;
- separate eligibility and automatic-approval policy;
- Listing, Reservation Hold, and Booking state machines;
- core-owned provider ports and provider package boundaries;
- versioned marketplace schema and server-side PostgreSQL repositories;
- atomic, idempotent Reservation Holds with overlap prevention and expiry;
- default-deny row-level security for browser access;
- real PostgreSQL integration tests for availability and persistence;
- marketplace API routes for profiles, Listings, search, Booking Quotes,
  Reservation Holds, Host decisions, and Booking status;
- stable request IDs and error envelopes;
- pseudonymous seed data for two Lisbon Listings and both approval paths.
- responsive Guest and Host demo desks;
- search, quote, automatic approval, manual Host review, and Booking status UI;
- Host-controlled Listing draft and publish flow;
- explicit loading, unavailable, empty, expired, rejected, and failed states;
- an evidence panel that distinguishes implemented and planned integrations;
- browser-level tests for both approval paths.
- durable, idempotent HTS deposit Operations with safe reconciliation;
- Mirror Node confirmation before Booking finalization;
- minimal HCS deposit evidence with Mirror Node read-back;
- Testnet preflight, deposit API routes, and HashScan links;
- explicit pending, reconciling, confirmed, and failed deposit UI states.
- official World AgentKit challenge and signed-retry flow;
- AgentBook verification with server-only anonymous human-reference hashing;
- persistent World nonce replay defense and a one-active-hold-per-human limit;
- atomic human-backed authorization and Reservation Hold creation;
- safe browser evidence that reveals no Agent or World identifier.
- direct Agent0 queries through The Graph on Base Sepolia;
- active registration, signing-wallet/owner/operator binding, and named booking
  capability enforcement;
- fail-closed Graph provider behavior with a short safe cache;
- guarded Agent0 registration and live status commands;
- safe browser evidence that never reveals the Graph key, raw response, or
  signing wallet.
- constrained Host drafting with inferred fields and unconfirmed suggestions
  clearly marked;
- Guest natural-language interpretation followed by deterministic database
  filtering and valid-only Agent ranking;
- strict OpenAI Structured Outputs with no response storage and bounded
  execution;
- visible deterministic fallback when OpenAI is absent or unavailable;
- Host review before saving and a separate confirmation before publication;
- adversarial tests preventing Agent output from selecting approval, payment,
  deposit, token, recipient, or an invalid Listing.

The first five database migrations are applied to the isolated `nook` schema in
hosted Supabase. The pseudonymous demo seed contains three profiles, two Lisbon
Listings with the Nook.rent HTS token, and their availability windows.

Monorepo layout:

```text
apps/
  web/                 marketplace and demo UI
  api/                 public HTTP API and composition root
  worker/              durable agent jobs and reconciliation
packages/
  core/                domain rules, use cases, and provider ports
  config/              typed environment configuration
  ai/                  constrained listing and matching adapters
  hedera/              HTS, HCS, Schedule Service, and Mirror Node
  world/               AgentKit and human-backed authorization
  the-graph/           live Subgraph queries and signal mapping
  supabase/            persistence repositories and migrations
supabase/
  migrations/          Nook.rent-owned database changes
docs/
  adr/                 durable architectural decisions
```

## Start here

1. Read [CONTEXT.md](./CONTEXT.md) for canonical product language.
2. Read [docs/PRODUCT_SPEC.md](./docs/PRODUCT_SPEC.md) for MVP behavior.
3. Read [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) for system boundaries.
4. Follow [docs/IMPLEMENTATION_PLAN.md](./docs/IMPLEMENTATION_PLAN.md) one phase
   at a time.
5. Review [docs/PRIZE_STRATEGY.md](./docs/PRIZE_STRATEGY.md) before changing a
   sponsor integration.
6. Review [docs/HEDERA_TESTNET.md](./docs/HEDERA_TESTNET.md) for public Testnet
   resource evidence.
7. Follow [docs/WORLD_AGENTKIT.md](./docs/WORLD_AGENTKIT.md) for the protected
   Guest Agent flow.
8. Follow [docs/THE_GRAPH_AGENT0.md](./docs/THE_GRAPH_AGENT0.md) to register and
   verify the same Agent through The Graph.

No credentials or private signing material belong in this repository.

## Run the marketplace

With `SUPABASE_DB_URL` configured in the root `.env`:

```text
pnpm dev
```

This starts the API and web application together. The API exposes `/health`,
`/ready`, and the marketplace routes under `/v1`. The web application uses
`VITE_API_URL`, or `http://localhost:3100` when it is not set.

`OPENAI_API_KEY` enables the live constrained Host and Guest Agents.
`OPENAI_MODEL` defaults to `gpt-5.6-sol`. Without an OpenAI key, the same UI and
API use a visible deterministic fallback; availability, pricing, approval, and
payments remain deterministic in both modes.

Running `pnpm supabase:seed-demo` is an explicit database write and should be
used only against the intended demo environment.

## Prepare Hedera Testnet

Configure Nook.rent-specific Testnet values from `.env.example`. The demo
operator pays the deposit token into the configured escrow account; both
accounts must be associated with that token. Then run the read-only preflight:

```text
pnpm hedera:preflight
```

The preflight verifies the operator, escrow account, token, HCS topic, token
associations, and payer token balance through Mirror Node. It does not submit a
transaction. Applying the Phase 5 migration and funding a deposit are separate,
explicit hosted writes. After setting `HEDERA_TOKEN_ID`, rerunning the explicit
demo seed updates the seeded Listings from their local placeholder to that
Testnet token.

Creating or reusing Testnet resources is guarded by an explicit confirmation:

```text
HEDERA_SETUP_CONFIRM=create-nook-testnet-resources pnpm hedera:setup
```

Do not run this command against unreviewed account or resource values.

## Working agreement

- Use TypeScript and `pnpm`.
- Use Conventional Commits.
- Keep LLM output outside financial and authorization policy.
- Keep browser code outside signing and durable state transitions.
- Keep Hedera work on Testnet unless scope is explicitly changed.
- Run formatting, linting, type-checking, and tests before pushing.

See [AGENTS.md](./AGENTS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md) for the
complete repository rules.
