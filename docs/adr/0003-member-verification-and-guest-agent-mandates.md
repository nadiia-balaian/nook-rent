# ADR 0003: Use Member verification and bounded Guest Agent mandates

Status: superseded by ADR 0004

Date: 2026-07-25

## Context

Nook.rent needs direct human onboarding for both sides of the marketplace and a
meaningful human-backed Agent workflow. Treating World AgentKit as the Guest's
only onboarding step would prove something about the Agent but would not record
that the Nook.rent Guest profile completed the same privacy-preserving Member
gate as a Host.

Allowing an Agent to choose arbitrary dates, prices, approval, or payment terms
would also cross the product's deterministic policy boundary.

## Decision

Every Host and Guest completes one action-specific World ID Member verification.
The private action-specific nullifier binds that verification to the Member
profile and is never returned to the browser or published as evidence.

A Guest may then connect the configured World-backed Agent. AgentBook verifies
the human-backed relationship and The Graph verifies the required live booking
capability.

After a constrained search, the Guest may authorize one Agent Mandate containing
the validated city, dates, occupancy, budget, and required amenities. Within
that mandate, the Agent may:

- select the highest-ranked Listing from deterministic database-valid results;
- create the deterministic Booking Quote from stored Listing terms;
- request one idempotent Reservation Hold through the protected AgentKit flow.

The Agent may not change financial terms, expand the mandate, approve a Booking
Request, fund escrow, or override availability. Stored Host Approval Policy
decides automatic approval or Host review.

The manual Listing, quote, and hold path continues to use the same application
services.

## Consequences

- Both onboarding paths show direct World ID before role-specific work.
- Guest Agent connection and every protected hold recheck direct Member
  verification.
- The live Agent workflow changes scarce marketplace state without giving the
  LLM financial or approval authority.
- Secure-match retries use one idempotency key and cannot create duplicate
  holds.
- World ID, World AgentKit, The Graph, Rental Reputation, and Host policy remain
  separate evidence and decision concepts.
- The hosted database needs the Member-generalization migration, and the World
  Developer Portal needs the `nook-member-onboarding` action before deployment.
