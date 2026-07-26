# ADR 0004: Use bounded one-use Agent Payment Mandates

Status: accepted

Date: 2026-07-26

## Context

ADR 0003 allowed the Guest Agent to select a valid Listing, accept a
deterministic quote, and request one hold, but required a second manual action
to fund escrow. That proves Agent-assisted booking, not autonomous value
movement.

Giving an Agent a general wallet key or letting an LLM choose an amount, token,
recipient, or approval result would violate Nook.rent's financial boundary.

## Decision

The Guest may explicitly authorize one Agent Payment Mandate together with the
secure-match action. The mandate is persisted and bound to:

- one Guest profile and verified Agent;
- one Booking and Booking Quote;
- one Hedera token;
- one maximum deposit;
- one expiry;
- one eventual financial Operation.

The application creates the mandate from validated stored state. It may be
consumed only after deterministic Host policy or an explicit Host decision
approves the Booking. The deposit service reloads the Booking and uses its
stored token, amount, and configured escrow recipient. The Agent supplies only
the mandate and operation references.

Mandate consumption and Operation preparation occur in one database
transaction. Retries return the same Operation; an expired, cancelled,
consumed, mismatched, or insufficient mandate is rejected before a Hedera
submission.

For the hackathon Testnet tracer, the configured Hedera operator remains the
token payer. The Agent controls when the authorized application action runs; it
never receives the operator key. A production Guest-funded design would require
a separately reviewed allowance, custody, or signature model.

The manual Listing and deposit path remains available and uses the same
application services.

## Consequences

- The demo shows autonomous Agent-triggered value movement after one explicit,
  bounded Guest authorization.
- No second “Fund deposit” click is required on the Agent path.
- The Agent cannot make a generic transfer or change stored financial terms.
- Host review can delay execution without expanding the mandate.
- The new database migration must be applied before a hosted or live Testnet
  demonstration.
- Existing Phase 5 live evidence proves the deposit infrastructure, but a new
  live run is required to prove the Agent Payment Mandate flow.
