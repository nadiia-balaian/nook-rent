# ADR 0004: Bind Member identity to server-owned browser sessions

Status: accepted

Date: 2026-07-26

## Context

The guided demo previously asked for a profile ID and then queried whether that
profile had completed World ID. Because the demo profile ID was shared, a fresh
or private browser could inherit another browser's verified state. Browser
input could also claim a different profile on protected requests.

World verification belongs to a Member rather than a Host or Guest role, but it
must not become a global login bypass.

## Decision

The API issues a cryptographically random opaque Member Session token and stores
only its SHA-256 hash. A new session has no profile and no verified state.

IDKit proofs use the server-issued Member Session ID as their signal. After
World verifies the proof, the API finds or creates the Member associated with
the private action-specific nullifier and binds only that session to the Member.
The session cannot later switch to another World identity.

Protected API routes derive the Member profile from the bearer session and
reject any mismatched claimed profile. The web app stores the token in
`sessionStorage`, so verification is reusable between Host and Guest only
inside the same active browser session.

## Consequences

- A fresh browser, new tab, or private session starts unverified.
- Switching between Host and Guest in one session does not repeat World ID.
- Re-proving the same World identity in another session reaches the same Member
  only after that session completes World ID.
- Raw tokens and World nullifiers remain server-side and are never published to
  HCS.
- Expired or invalid sessions fail closed on protected routes.
- Hosted deployment requires the Member Session migration before the new API
  version is activated.
