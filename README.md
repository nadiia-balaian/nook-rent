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

This first commit establishes the product language, architecture, implementation
sequence, sponsor strategy, testing expectations, and repository rules. Runtime
applications will be scaffolded in the next phase.

Planned monorepo layout:

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

No credentials or private signing material belong in this repository.

## Working agreement

- Use TypeScript and `pnpm`.
- Use Conventional Commits.
- Keep LLM output outside financial and authorization policy.
- Keep browser code outside signing and durable state transitions.
- Keep Hedera work on Testnet unless scope is explicitly changed.
- Run formatting, linting, type-checking, and tests before pushing.

See [AGENTS.md](./AGENTS.md) and [CONTRIBUTING.md](./CONTRIBUTING.md) for the
complete repository rules.
