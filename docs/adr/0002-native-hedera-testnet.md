# ADR 0002: Use native Hedera Testnet services

Status: accepted

Date: 2026-07-25

## Context

Nook.rent needs real hackathon evidence for escrow, Agent-triggered payment, and
verifiable rental events. Hedera provides native token, scheduling, consensus,
and read APIs without requiring a smart contract.

## Decision

The baseline uses:

- HTS test tokens for deposit and Booking payment;
- HCS for versioned, pseudonymous rental events;
- Mirror Node for authoritative read-back;
- Schedule Service when delayed or signature-gated execution is demonstrated.

The baseline does not add Solidity.

Every external financial write is protected by a durable Operation, stable
idempotency key, reserved transaction identity, and reconciliation.

## Consequences

- The project remains eligible for Hedera native-service evaluation.
- Visual-only escrow is not acceptable sponsor evidence.
- Provider keys remain server-side.
- Testnet assets must be labeled as having no real monetary value.
- Mainnet custody, production stablecoins, and legal compliance remain future
  work.
