# Nook.rent testing and evidence plan

## Test layers

### Unit tests

Pure, deterministic tests for:

- local date parsing and night count;
- 3-night minimum and 90-night maximum;
- exact price and deposit arithmetic;
- Approval Policy;
- Listing, hold, Booking, escrow, and payment state machines;
- Rental Reputation ordering and deduplication;
- HCS envelope validation;
- AI structured-output rejection.

Unit tests have no network access.

### Repository and adapter tests

Supabase repositories run against an isolated PostgreSQL database. The
Reservation Hold suite applies the real migration and proves:

- concurrent overlap prevention;
- idempotent retries;
- expiry and date release;
- Listing hard filters;
- exact Booking amount mapping;
- default-deny row-level security.

The deposit Operation suite additionally proves:

- one prepared Operation, Escrow, and deposit Payment per Booking;
- idempotent preparation with immutable token, amount, and receiver terms;
- atomic Booking confirmation, Hold conversion, Escrow funding, and Payment
  confirmation.

Other provider adapters use controlled fakes that match captured, redacted
schemas:

- World verification outcomes and nonce behavior;
- Graph Agent0 query mapping and provider failures;
- Hedera submission and Mirror Node reconciliation;
- AI structured responses and refusal paths.

Fakes prove application behavior, not sponsor eligibility.

The Hedera adapter unit suite covers configuration rejection, Mirror Node
transaction mapping, HCS decoding, evidence privacy rules, and message size.
The core deposit suite covers successful confirmation, unknown submission
reconciliation without resubmission, and safe Hold release after confirmed
failure.

### Hosted integration tests

Explicitly authorized checks for:

- applying migrations to hosted Supabase;
- World registration and protected requests;
- live Graph gateway query;
- Hedera Testnet HTS transfer;
- Mirror Node read-back;
- HCS submission and sequence read-back.

Hosted tests must be opt-in and use isolated demo resources.

### End-to-end tests

Exercise the deployed web and API:

- Host creates and publishes a Listing;
- Guest searches and accepts a quote;
- unverified Agent is denied;
- verified Agent creates a hold;
- automatic approval succeeds for an experienced Guest;
- Newcomer is routed to Host review;
- deposit confirms the Booking;
- conflicting dates fail;
- expired hold releases dates;
- evidence links render.

The current Phase 3 integration suite exercises the API portion through
Listing publication, search, deterministic quote creation, atomic hold,
automatic approval, Host review, Host decision, idempotent retry, and
conflicting-date rejection.

The Phase 4 browser-component suite exercises API readiness, Guest/Host role
switching, search and quote presentation, automatic approval, Newcomer Host
review, the explicit Host decision handoff, deposit confirmation, and HTS/HCS
evidence links.

The Phase 5 API integration path uses controlled Hedera fakes with real
PostgreSQL repositories to prove the full local flow through confirmed Booking,
converted Hold, funded Escrow, confirmed Payment, and idempotent retry. It does
not count as live sponsor evidence.

The opt-in Phase 5 exit run additionally proved one hosted automatic-approval
Booking, real HTS deposit, initial `reconciling` response, Mirror Node
confirmation, HCS sequence read-back, exact token balance movement, and a retry
with no second submission. Public identifiers and explorer links are recorded
in [HEDERA_TESTNET.md](./HEDERA_TESTNET.md).

The Phase 6 local suite uses the official AgentKit client to prove the `402`
challenge and signed retry protocol. Controlled verifier dependencies cover
invalid and unverified Agent outcomes without sending World proofs over the
network. The real PostgreSQL suite atomically verifies nonce replay rejection,
one active Hold per anonymous human, Agent binding, and idempotent retry. These
tests prove application behavior. The opt-in live exit run additionally proved
Agent registration, AgentBook lookup on World Chain, protected Hold creation,
fresh-nonce idempotent retry, and rejection of a second concurrent Hold.

The Phase 7 adapter suite verifies the exact Agent0 response mapping, wallet
binding, named capability extraction, cache behavior, absent registrations,
malformed registration metadata, GraphQL failures, and provider timeouts. API
tests prove that the protected hold fails closed when Graph is unconfigured,
unavailable, unregistered, inactive, or missing the required capability. UI
tests prove that only safe named Graph evidence is displayed. These are local
controlled tests and do not count as live Graph evidence.

The Phase 8 suite validates OpenAI-shaped Structured Outputs without network
calls. It proves deterministic fallback, clarification for incomplete Guest
requests, hard filtering before ranking, rejection of invented or duplicated
Listing IDs, strict rejection of extra financial fields, and rejection of
financial or private-access claims in generated copy. API and browser-component
tests cover both the Guest matching tracer and the Host review-before-publish
tracer. These controlled tests do not count as a paid live OpenAI check.

## Required negative cases

- stay shorter than 3 nights;
- stay longer than 90 nights;
- check-out not after check-in;
- quote changed after Guest confirmation;
- overlapping hold;
- duplicate idempotency key with different payload;
- World proof replay;
- Agent wallet does not match the Graph registration;
- Graph provider unavailable;
- AI invents an unsupported amenity;
- AI ranking references a Listing outside deterministic search results;
- AI output attempts to add approval, deposit, token, or access authority;
- escrow submission timeout;
- confirmed Hedera transaction after local timeout;
- duplicate HCS event;
- unauthorized access to exact address or Check-in Instructions.

## Demo fixtures

Use pseudonymous, clearly seeded data:

- one Host;
- one experienced Guest;
- one Newcomer;
- one unverified Agent;
- two Lisbon Listings;
- one conflicting date request.

Do not use personal phone numbers, real home addresses, production door codes,
raw World identifiers, or funded production wallets.

## Sponsor evidence

For each live integration, capture:

- date and network;
- application action;
- redacted request summary;
- provider result identifier;
- public explorer or provider link where safe;
- commit SHA;
- whether the evidence is reusable or one-time.

Evidence files must contain no private keys, API keys, database URLs, access
instructions, or identity proofs.

## Manual tester script

The public tester guide should eventually contain:

1. deployed URL;
2. available demo roles;
3. automatic-approval path;
4. manual-review path;
5. expected status at each step;
6. how to identify seeded/Testnet behavior;
7. known limitations;
8. safe way to report a problem.

## Quality gate

The root check command runs:

```text
format check
lint
type-check
unit tests
```

Web and deployment changes additionally require a production build.

Live Testnet, hosted database, World, Graph, and paid AI checks remain separate
opt-in commands.

The PostgreSQL integration suite runs automatically in CI. Locally, set
`TEST_DATABASE_URL` to an isolated disposable database before `pnpm test` to run
it; otherwise it is skipped.
