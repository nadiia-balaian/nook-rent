# Repository instructions for AI agents

These instructions apply to the entire repository. Follow the user's request
first, then preserve the product and safety boundaries documented here.

## Start here

Before making changes, read:

1. `CONTEXT.md` for canonical product language;
2. `docs/PRODUCT_SPEC.md` for the current MVP;
3. `docs/ARCHITECTURE.md` for package and runtime boundaries;
4. relevant decisions under `docs/adr/`;
5. `docs/IMPLEMENTATION_PLAN.md` before selecting the next phase.

Do not present planned integrations as implemented evidence.

## Working method

- Inspect `git status` and the relevant diff before editing.
- Preserve user-owned changes and keep each change focused.
- Use `pnpm`; do not add a second package manager.
- Prefer existing domain services, ports, and adapters over parallel
  implementations.
- Use Conventional Commits with one logical concern per commit.
- Do not commit, push, open pull requests, publish comments, or mutate external
  issue state unless the user explicitly requests that action.
- Format every changed file with Prettier before committing or pushing.

## Project identity

- Use only Nook.rent names, namespaces, examples, fixtures, and user-facing copy.
- Never commit credentials, evidence containing private information, deployed
  private keys, generated build output, or environment files.

## Architecture boundaries

- `packages/core` owns entities, policies, workflows, and provider ports. It must
  not import provider SDKs or environment configuration.
- Provider packages implement core-owned ports and must not call one another.
- `apps/api` and `apps/worker` are composition roots.
- `apps/web` is a thin client over API reads and commands.
- HTTP routes and Agent tools call the same application services.
- LLM output is untrusted. It may produce a Listing draft, select an allowed
  intent, rank already-valid results, or explain a policy result.
- Dates, availability, price, deposit, recipient, token, approval, and operation
  identity come from validated stored state and deterministic policy.
- Browser code never receives signing keys, database service credentials, World
  signing secrets, or payment authority.

## External consistency

- Supabase and blockchain writes cannot form one atomic transaction.
- Create a durable Operation and reserve a stable transaction identity before
  every external financial submission.
- Every retry must be idempotent.
- Reconcile submitted operations through authoritative provider records.
- An escrow failure must release or expire the Reservation Hold safely.

## Sponsor boundaries

- Hedera work is Testnet-only unless the user explicitly changes scope.
- Keep the baseline free of Solidity while targeting Hedera's native-services
  prize.
- World proves human-backed authorization; it does not create Rental Reputation.
- The Graph must query live provider data. Mocked or static Graph responses do
  not count as sponsor evidence.
- The Graph returns named Onchain Signals; an LLM does not invent a composite
  approval score from wallet history.
- HCS contains no personal information, World nullifier, exact address, door
  code, raw identity proof, or stable cross-service identifier.

## Validation

Run validation in proportion to the change:

- format all changed files;
- run focused tests while iterating;
- run the repository check command before handoff;
- build the web application after UI or deployment changes;
- treat hosted migrations, real Testnet transactions, paid API calls, and remote
  smoke tests as explicit external operations.

Report skipped checks and the reason.

## Documentation

- Update `CONTEXT.md` when canonical domain language changes.
- Update the product specification and plan when scope changes.
- Add or supersede an ADR only for durable, consequential decisions.
- Keep sponsor requirements and evidence claims synchronized with working code.
- Label mocks, Testnet assets, seeded data, and future work clearly.
