# Nook.rent implementation plan

Status: ready to start
Strategy: build one end-to-end tracer bullet, then deepen it

## Completion rule

A phase is complete only when:

- its behavior is implemented through the documented architecture;
- deterministic tests pass;
- changed files are formatted;
- no secrets or private identity data appear in the diff;
- documentation reflects actual behavior;
- mocks and remote evidence are labeled separately.

Remote migrations, Testnet transactions, paid AI calls, World registrations, and
live Graph queries require explicit execution approval.

## Phase 0: documentation baseline

Status: first commit

Deliver:

- product specification;
- canonical domain language;
- architecture and ADRs;
- sponsor strategy;
- implementation and testing plans;
- repository and AI-agent rules;
- environment variable template;
- empty monorepo ownership map.

Exit check:

- no source code or deployment is presented as implemented;
- all vocabulary and namespaces belong to Nook.rent.

## Phase 1: monorepo and deterministic core

Estimate: 3–5 focused hours

Create:

- root `pnpm` workspace and shared TypeScript configuration;
- `apps/api`, `apps/worker`, and `apps/web`;
- `packages/core` and `packages/config`;
- formatting, linting, type-checking, and unit-test scripts;
- CI for the local quality gate.

Implement first:

- local-date and stay-length value objects;
- `TokenAmount` or equivalent exact amount type;
- Listing and Booking Quote validation;
- 3–90-night calculation;
- Approval Policy;
- Booking and Reservation Hold state machines;
- provider port interfaces.

Exit check:

```text
pnpm check
```

passes without external services.

## Phase 2: Supabase persistence and availability

Estimate: 4–6 focused hours

Create migrations for:

- profiles;
- Agent bindings and verification summaries;
- Listings;
- Availability Windows;
- Booking Quotes;
- Reservation Holds;
- Booking Requests;
- Bookings;
- Escrows and Payments;
- Operations;
- rental events and reputation projections.

Implement:

- repositories behind core ports;
- atomic hold creation;
- overlap prevention;
- hold expiry;
- idempotency constraints;
- server-only access and default-deny browser policy.

Exit check:

- two concurrent requests cannot hold overlapping dates;
- retrying one request returns the same hold;
- an expired hold releases dates.

## Phase 3: marketplace API tracer

Estimate: 3–5 focused hours

Implement:

- `/health` and `/ready`;
- Listing create, publish, list, and detail routes;
- Booking Quote route;
- Reservation Hold route;
- Host approval decision route;
- Booking status route;
- stable error envelope and request IDs.

Use seeded pseudonymous profiles and two Lisbon Listings.

Exit check:

```text
create listing
  -> search by dates
  -> receive quote
  -> create hold
  -> automatic or manual approval result
```

works locally without AI or blockchain dependencies.

## Phase 4: minimal marketplace UI

Estimate: 4–7 focused hours

Implement:

- role switch for demo Host and Guest;
- Listing creation form and Agent draft review;
- search by city, dates, budget, and amenities;
- Listing cards and quote summary;
- Booking status timeline;
- Host review screen;
- sponsor evidence panel;
- explicit loading, unavailable, expired, rejected, and failed states.

Exit check:

- a tester can complete both automatic-approval and manual-review paths without
  reading technical documentation.

## Phase 5: Hedera financial tracer

Estimate: 4–7 focused hours

Implement or adapt:

- typed Hedera Testnet configuration;
- Testnet preflight;
- real HTS deposit operation;
- optional Booking payment or schedule;
- shared HCS event publisher;
- Mirror Node read-back;
- HashScan evidence links;
- operation reconciliation and safe retry.

Integration sequence:

```text
approved hold
  -> pending Operation
  -> reserved Hedera transaction
  -> submitted
  -> confirmed through Mirror Node
  -> Booking confirmed
  -> HCS event published
```

Exit check:

- one real Testnet financial operation is visible on HashScan;
- retry does not duplicate the transfer;
- a simulated timeout can be reconciled.

## Phase 6: World human-backed authorization

Estimate: 4–7 focused hours

Implement:

- Agent wallet registration flow;
- AgentKit client for the Guest Agent;
- protected hold or Booking endpoint;
- AgentBook verification;
- persistent nonce and per-human hold-limits;
- clear unauthorized and replay errors.

Exit check:

- unverified Agent can browse but cannot hold dates;
- human-backed Agent can create one valid hold;
- replay is rejected;
- no World identifier appears in HCS or browser logs.

## Phase 7: The Graph live Agent signals

Estimate: 3–5 focused hours

Implement:

- server-side Graph gateway client;
- Agent0 Subgraph query;
- Agent registration, wallet/operator, active-state, and capability mapping;
- provider timeouts and normalized failures;
- cache with short expiry;
- UI evidence showing the live query source.

Exit check:

- protected booking fails closed if required registration is absent;
- the Agent reasons or acts on a live Graph response;
- mocked responses are used only by local tests;
- the demo identifies the endpoint and Subgraph ID.

## Phase 8: constrained AI Agents

Estimate: 4–7 focused hours

### Host Agent

- turn Host facts and photos into a structured Listing draft;
- mark inferred amenities;
- require Host confirmation before publishing.

### Guest Agent

- turn natural language into typed search filters;
- rank only database-filtered candidates;
- explain match and policy results.

### Guardrails

- closed intent schemas;
- strict structured output validation;
- no secrets or private access information in prompts;
- no AI-selected payment or approval parameters;
- deterministic fallback for unavailable AI.

Exit check:

- malformed or adversarial output cannot publish, approve, or pay;
- the core marketplace still works when AI is disabled.

## Phase 9: Rental Reputation

Estimate: 3–5 focused hours

Implement:

- versioned rental-event envelope;
- ordered and deduplicated HCS projection;
- deterministic contribution rules;
- Newcomer and experienced tiers;
- reputation-adjusted deposit quote;
- contribution explanation.

Exit check:

- replaying the same event does not change the result;
- conflicting duplicates fail visibly;
- World and Graph signals do not change Rental Reputation.

## Phase 10: hardening and submission

Estimate: 4–6 focused hours

Complete:

- end-to-end happy and negative paths;
- deployment configuration;
- fresh-environment setup;
- remote evidence capture;
- privacy and secret scan;
- public README setup instructions;
- architecture diagram;
- sponsor evidence table;
- 2–4 minute Graph video if submitted;
- no-longer-than-5-minute Hedera video;
- one coherent main demo.

## Priority cut line

If time is limited, protect this path:

```text
seeded Listing
  -> Guest Agent search
  -> World rejects unverified Agent
  -> World accepts human-backed Agent
  -> The Graph returns live Agent registration
  -> atomic hold
  -> deterministic approval
  -> real Hedera deposit
  -> confirmed Booking and evidence
```

Defer in this order:

1. photo analysis;
2. AI pricing;
3. external calendars;
4. optional onchain credentials;
5. notifications;
6. production Check-in Instructions;
7. Selfie or Identity Check beta tracks.

## Estimated effort

| Scope                                     |         Focused effort |
| ----------------------------------------- | ---------------------: |
| Deterministic marketplace tracer          |            10–16 hours |
| Sponsor-complete backend tracer           | 12–20 additional hours |
| Minimal UI and demo states                |   5–9 additional hours |
| Full baseline including AI and reputation |      35–55 hours total |

Provider access or registration delays may add time.

## First coding task

Start with Phase 1 and deliver one commit:

```text
chore: scaffold the TypeScript monorepo
```

That commit should include the workspace, application/package skeletons, quality
gate, and the first failing-then-passing tests for 3–90-night validation.
