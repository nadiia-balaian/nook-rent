# ADR 0006: Use World ID session proofs for Member authentication

Status: accepted

Date: 2026-07-26

## Context

Nook originally used the `nook-member-onboarding` uniqueness action whenever a
fresh browser created a Member Session. World correctly rejected the same
human's second attempt after the action reached its verification limit. Raising
that limit would preserve a recurring-action anti-pattern and would not provide
the World ID 4.0 continuity identifier intended for authentication.

Nook still requires browser-scoped authorization: Host and Guest roles may
reuse verification inside one Member Session, while a fresh or private browser
must prove World ID before protected actions.

## Decision

Member onboarding uses the World ID 4.0 session flow:

- the server signs an RP context without an action;
- the browser opens `IDKitSessionWidget` with Proof of Human constrained to the
  server-issued Member Session ID as its signal;
- the server forwards the unmodified session proof to World's v4 verifier;
- the private `session_id` is the continuity identifier;
- the first value in `session_nullifier` is persisted in a replay ledger;
- the World Session ID and session nullifier are never returned in Nook's
  public verification response;
- the opaque Nook Member Session token remains browser-session scoped.

Legacy action verification rows remain readable during migration but new Member
verification writes use the session model.

## Consequences

- A human can complete verification from a fresh browser without receiving
  World's “Already verified for this action” error.
- Changing between Host and Guest in one Nook Member Session does not open World
  again.
- One World session proof cannot authenticate two Nook Member Sessions.
- A Nook Member Session cannot switch to another World Session ID.
- Hosted deployment requires the World session migration before deploying the
  API that writes session proofs.
- `WORLD_ID_ACTION` is no longer required.
