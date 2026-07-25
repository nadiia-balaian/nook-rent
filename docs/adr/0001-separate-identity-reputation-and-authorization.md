# ADR 0001: Separate identity, reputation, and authorization

Status: accepted

Date: 2026-07-25

## Context

Nook.rent combines World, The Graph, verified rental history, AI Agents, and
financial policy. Combining all available signals into one generic score would
be easy to demonstrate but difficult to explain, unfair to newcomers, and
unsafe as an authorization boundary.

An old wallet, ENS registration, POAP collection, or DeFi position does not prove
that a person behaves responsibly during a stay. Human uniqueness also does not
prove rental behavior.

## Decision

Nook.rent maintains distinct concepts:

- World supplies human-backed Agent authorization.
- The Graph supplies named, live Onchain Signals.
- Nook.rent Rental Reputation reflects defined rental behavior only.
- Host-approved deterministic policy decides automatic approval.
- Hedera supplies financial execution and public rental evidence.

Onchain Signals may be displayed or used for narrowly stated capability checks.
They do not add Rental Reputation in the baseline.

Missing wallet history is not negative evidence. Newcomers receive a Host review
path rather than an automatic rejection.

## Consequences

- The UI must label each signal by source and meaning.
- Approval explanations can identify the exact rule that passed or failed.
- Provider adapters return structured facts, not an opaque composite score.
- Rental Reputation can evolve without changing World or Graph integration.
- The product avoids making financial activity a proxy for personal
  trustworthiness.
- The demo needs separate evidence for World, The Graph, policy evaluation, and
  Hedera.
