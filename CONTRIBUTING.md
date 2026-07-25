# Contributing to Nook.rent

## Before starting

Read `CONTEXT.md`, `AGENTS.md`, the product specification, and the relevant
implementation phase. Confirm that the task uses canonical Nook.rent language
and fits the documented package boundaries.

## Branches and commits

- Keep branches limited to one feature or repair.
- Use Conventional Commits:
  - `feat:` product behavior;
  - `fix:` defect repair;
  - `docs:` documentation only;
  - `test:` test-only changes;
  - `refactor:` behavior-preserving restructuring;
  - `chore:`, `build:`, or `ci:` repository maintenance.
- Write imperative commit subjects.
- Do not combine unrelated formatting or cleanup with a feature.

## Quality gate

Before requesting review or pushing:

1. format every changed file with Prettier;
2. run focused tests;
3. run the repository check command;
4. build affected applications;
5. inspect the diff for secrets, legacy names, unsafe logging, and unsupported
   sponsor claims.

Remote migrations, Testnet writes, and paid API checks require explicit
authorization.

## Security

- Never commit `.env` files, private keys, service-role credentials, World
  signing secrets, Graph API keys, or raw provider responses containing
  identifiers.
- Never send exact addresses, access instructions, or identity proofs to public
  logs or HCS.
- Never allow an LLM to choose financial or authorization parameters.
- Use seeded pseudonymous data for demonstrations.

## Pull requests

Describe:

- the user outcome;
- affected domain rules;
- validation performed;
- remote checks deliberately skipped;
- sponsor evidence added or changed;
- security and privacy implications.
