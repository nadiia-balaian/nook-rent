# Nook.rent implementation plan

Status: active; Phases 0–7 complete, Phase 8 implemented; live smoke pending
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

Status: implemented and refined into a guided demo flow on 2026-07-25

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

Status: implemented on 2026-07-25; hosted `nook` schema migrated

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

Status: implemented on 2026-07-25; hosted demo seed applied

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

Status: implemented locally on 2026-07-25

Implement:

- role switch for demo Host and Guest;
- Listing creation form and Agent draft review;
- search by city, dates, budget, and amenities;
- exclude overlapping live Holds and confirmed Bookings before Agent ranking;
- Listing cards and quote summary;
- Booking status timeline;
- Host review screen;
- sponsor evidence panel;
- explicit loading, unavailable, expired, rejected, and failed states.

Refined demo UI:

- calm Nook visual system using Woven Linen, Hearth Pine, and Welcome Clay;
- responsive screen-by-screen Host and Guest journeys;
- project-owned generated Lisbon Listing imagery with no external hotlinks;
- natural-language Guest Agent search and valid-only match explanations;
- explicit review gates for Agent copy and Listing publication;
- separate presentation of demo Rental Reputation, World authorization, Graph
  Agent0 signals, and Hedera Testnet evidence;
- safe future Check-in Instructions teaser with no fake access secrets.

Exit check:

- a tester can complete both automatic-approval and manual-review paths without
  reading technical documentation.

## Phase 5: Hedera financial tracer

Estimate: 4–7 focused hours

Status: completed on 2026-07-25 with hosted persistence and live Testnet
deposit/HCS evidence

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

Implemented locally:

- Testnet-only typed configuration and a read-only Mirror Node preflight;
- native HTS token transfer using a transaction ID reserved before submission;
- durable Operation, Escrow, and Payment persistence;
- Mirror Node reconciliation as the financial source of truth;
- atomic Booking confirmation and Reservation Hold conversion;
- minimal HCS event publication with exact sequence read-back;
- deposit, Operation status, and manual reconciliation API routes;
- Testnet transaction and HCS evidence states in the demo UI;
- deterministic timeout, retry, failure, Mirror Node, and HCS tests.
- guarded Testnet resource setup with signer validation and safe partial-run
  reuse.

Completed exit evidence:

- all three migrations applied to hosted Supabase;
- both seeded Listings updated to the Nook.rent HTS token;
- one automatic-approval Booking funded with 50,000 atomic units;
- Mirror Node confirmed the transfer and exact escrow balance;
- Booking confirmed, Payment confirmed, Escrow funded, and Hold converted;
- HCS `booking.deposit.funded` evidence published at sequence 1;
- retry returned the same transaction with one submission attempt.

## Phase 6: World human-backed authorization

Estimate: 4–7 focused hours

Status: Guest AgentKit and direct World IDKit onboarding are implemented.
Server-owned Member Sessions now bind verified identity to one active browser
session; the new hosted session migration remains pending explicit application.

Implement:

- Member Proof of Human for Host and Guest through the real IDKit World App QR
  flow;
- server-signed RP context and server-side Member proof verification;
- private, action-specific Member nullifier persistence;
- opaque server-owned Member Sessions with hashed tokens;
- same-session Host and Guest verification reuse without cross-session sharing;
- Agent wallet registration flow;
- AgentKit client for the Guest Agent;
- protected hold or Booking endpoint;
- AgentBook verification;
- persistent nonce and per-human hold-limits;
- clear unauthorized and replay errors.

Exit check:

- Host cannot create a Listing before a valid World ID proof;
- Guest cannot connect an Agent or hold dates before a valid World ID proof;
- unverified Agent can browse but cannot hold dates;
- human-backed Agent can create one valid hold;
- replay is rejected;
- no World identifier appears in HCS or browser logs.
- a fresh browser session cannot inherit another session's verification.

Local evidence:

- both guided role paths have no demo bypass and continue only after the API
  verifies the direct Member World ID result;
- API tests prove safe configuration, server-signed RP context, proof
  verification, private persistence, session isolation, and nullifier
  redaction;
- the official AgentKit client completes the `402` challenge and signed retry;
- the two-step guided Guest UI requires live World and The Graph verification
  badges before continuing;
- browser-initiated holds are executed by the server-side World-backed Guest
  Agent without exposing signing material;
- API tests distinguish missing proof from an unverified Agent;
- real PostgreSQL tests prove idempotent retry, nonce rejection, and the
  one-active-hold limit;
- the API returns only a boolean human-backed evidence state to the browser.
- the Agent wallet is registered in AgentBook on World Chain;
- an unsigned live request returned the AgentKit `402` challenge;
- the registered Guest Agent created an auto-approved Reservation Hold;
- a fresh-nonce retry returned the same Hold without duplication;
- a second concurrent Hold from the same verified human was rejected.

## Phase 7: The Graph live Agent signals

Estimate: 3–5 focused hours

Status: completed and verified live on 2026-07-25.

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

Implemented locally:

- direct server-side query of the Agent0 Base Sepolia Subgraph;
- signing-wallet, owner, and operator binding;
- active-registration and named booking-capability enforcement;
- fail-closed provider, timeout, malformed-response, missing-registration,
  inactive-registration, and missing-capability behavior;
- short-lived result cache;
- safe API and UI evidence without addresses, API keys, or raw responses;
- guarded one-time Base Sepolia registration helper and public ERC-8004
  document;
- live status command and deterministic adapter/API/UI tests.

Completed live exit:

- configured the server-only Graph API key;
- registered the existing World Guest Agent wallet as Agent `84532:8442`;
- verified the indexed active registration and named capability;
- created one protected live Hold with safe World and Graph evidence;
- repeated the same request without creating another Hold or Booking.

### Optional consented wallet evidence

Status: implemented locally; live Reown, ENS, and POAP smoke test pending.

- connect an optional Guest EVM wallet through Reown;
- prove wallet control with a short-lived, read-only signed message;
- query indexed ENS ownership through The Graph server-side;
- query public POAP Compass history server-side;
- display The Graph ENS and POAP Compass results as separately named signals;
- keep wallet activity separate from Rental Reputation and approval.

This enhancement is additive. A Guest with no wallet or no POAPs keeps the same
World-verified marketplace access and Host review path.

## Phase 8: constrained AI Agents

Estimate: 4–7 focused hours

Status: implemented locally on 2026-07-25; one opt-in live OpenAI smoke test
remains.

### Host Agent

- turn Host facts and photos into a structured Listing draft;
- mark inferred amenities;
- require Host confirmation before publishing.

### Guest Agent

- turn natural language into typed search filters;
- rank only database-filtered candidates;
- explain match and policy results.
- accept one Guest-approved Agent Mandate;
- select the top valid match, create its deterministic quote, and request one
  protected Reservation Hold;

### Guardrails

- closed intent schemas;
- strict structured output validation;
- no secrets or private access information in prompts;
- no AI-selected payment or approval parameters;
- deterministic fallback for unavailable AI.

Exit check:

- malformed or adversarial output cannot publish, approve, or pay;
- the core marketplace still works when AI is disabled.

Implemented locally:

- server-only OpenAI Responses API adapter with strict Zod Structured Outputs;
- `gpt-5.6-sol` default with low reasoning effort, low verbosity, no response
  storage, bounded output, timeout, and no automatic retry;
- Host Agent draft from public structured facts and optional HTTPS image inputs;
- explicit inferred-field and unconfirmed-amenity markers;
- Host review before a Listing draft is saved and separate confirmation before
  publication;
- Guest natural-language interpretation with a clarification result for missing
  hard filters;
- deterministic database filtering before the Agent sees candidates;
- ranking restricted to exact valid Listing IDs;
- deterministic Host, search-interpretation, and ranking fallback;
- API and UI evidence distinguishing live OpenAI from fallback execution;
- idempotent secure-best-match orchestration that reuses the same search,
  pricing, World, Graph, hold, and stored approval-policy boundaries as the
  manual path;
- negative tests for field smuggling, invented Listing IDs, invalid hard
  filters, provider failure, and private or financial draft claims.

Remaining live exit:

- run one explicitly approved Host draft and Guest search against OpenAI;
- confirm the API reports live execution without exposing prompts, keys, or raw
  provider responses.

## Phase 9: Rental Reputation

Estimate: 3–5 focused hours

Status: backend projection deferred temporarily; the guided UI uses explicitly
labeled seeded demo tiers only.

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
  -> direct Guest World ID Member verification
  -> Guest Agent search
  -> one secure-best-match Agent Mandate
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

## Next coding task

Create the `nook-member-onboarding` World action, apply the two pending World ID
migrations, live-test both role onboarding paths, and then deploy the updated
API and web application. Complete the Phase 8 live OpenAI smoke test after that.
The real Phase 9 projection may follow after the UI tracer is ready:

```text
chore: harden deployed demo flow
```

Until Phase 9 is implemented, seeded tiers must stay labeled as demo data and
must never be presented as live HCS evidence. World and Graph signals remain
separate.
