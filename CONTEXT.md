# Nook.rent domain context

## Product statement

Nook.rent is a P2P sublet marketplace for digital nomads, supporting temporary
stays of 3 to 90 nights. Human-backed agents reduce the work of creating,
finding, and booking a stay. Nook.rent keeps approval rules explicit, protects
scarce dates with reservation holds, secures funds in escrow, and turns verified
rental behavior into portable Rental Reputation.

## Ubiquitous language

Use these terms consistently in product copy, code, tests, documentation, and
issues.

### Member

A person with a Nook.rent profile. A Member may act as a Host, a Guest, or both.
A Member is not a wallet, an agent, or a blockchain account.

### Host

A Member offering a home for a temporary stay. A Host controls the Listing,
Availability Windows, house rules, and Approval Policy.

### Guest

A Member requesting and completing a temporary stay. A Guest may earn Rental
Reputation from verified Booking outcomes.

### Agent

A software actor operating within a narrowly defined capability set on behalf
of a Member. Host and Guest Agents use separate permissions and never determine
financial parameters from natural-language text.

### Agent Mandate

A one-time, Member-approved instruction that gives an Agent bounded authority
to act within validated constraints. A Guest Agent Mandate may include city,
dates, occupancy, budget, and required amenities. It may select from valid
Listings, accept the deterministic Booking Quote, and request one Reservation
Hold. When the Guest also creates an Agent Payment Mandate, it may settle the
stored deposit after deterministic approval. It cannot alter price, dates,
Host policy, payment terms, or approval.

### Agent Payment Mandate

A one-use, Guest-approved financial authorization attached to one Agent
Mandate. It is bound to one Booking, Booking Quote, settlement token, maximum
deposit, Agent, and expiry. The Agent may consume it only to fund the exact
stored Booking deposit after deterministic Host policy or explicit Host review
approves the request. The Agent never supplies the amount, recipient, token, or
approval result. Consumption is recorded with the durable financial Operation.

### Human-backed authorization

Proof that a Member is a real, unique person and that an Agent acts for that
person. It controls access to protected actions but does not measure rental
behavior.

### World ID Member verification

An action-specific Proof of Human completed by every Member during onboarding,
whether they continue as Host, Guest, or both. It confirms uniqueness without
revealing the Member's name, wallet, or exact home address. It is not Rental
Reputation and is separate from Guest Agent authorization.

### Listing

A Host's offer of a home, including public description, approximate location,
amenities, house rules, nightly rate, and Availability Windows. Exact access
details are not part of a public Listing.

### Availability Window

A date range during which a Listing may be requested. Availability is not a
Booking and does not reserve dates.

### Booking Quote

The deterministic price and deposit calculation for a particular Listing,
Guest, and date range. A quote is temporary and does not reserve dates.

### Reservation Hold

An expiring reservation of specific dates while approval and escrow are being
completed. An active hold prevents conflicting holds and Bookings.

### Booking Request

A Guest's request to book a Listing for specific dates under a displayed
Booking Quote.

### Approval Policy

The explicit Host-approved rules that decide whether a Booking Request can be
approved automatically or requires Host review. An Agent may explain the result
but may not invent or override the rules.

### Booking

The confirmed agreement between a Host and Guest for one Listing and date
range. It owns the agreed price, deposit, rules, and lifecycle.

### Rental Reputation

Nook.rent's deterministic measure of verified rental behavior. It is derived
from completed stays and other explicitly defined rental events. Human-backed
authorization and public onchain activity do not add Rental Reputation.

### Onchain Signal

A named, publicly queryable fact associated with a consented wallet or Agent,
such as registration, operator binding, advertised capability, ENS name, or
POAP participation count. An Onchain Signal is not private identity and is not
automatically a trust score.

### Escrow

The custody mechanism holding a Guest's deposit under stored Booking terms
until release, cancellation, or dispute resolution.

### Payment

A stored Booking obligation executed under deterministic policy. A Payment is
distinct from an Operation and from an HCS Record.

### Operation

The durable, idempotent record surrounding an external write. It preserves the
intent, reserved transaction identity, lifecycle, and recovery information
needed to prevent duplicate financial effects.

### HCS Record

A versioned, pseudonymous rental event submitted to Hedera Consensus Service.
It provides public ordering and evidence without containing personal
information, raw identity proof, exact address, or access instructions.

### Check-in Instructions

Private information needed to access a confirmed stay. Check-in Instructions
are released only to the authorized Guest at the appropriate time.

## Language to avoid

- Do not use a generic “trust score.” Say Rental Reputation or name the specific
  Onchain Signal.
- Do not call World verification reputation.
- Do not call public wallet activity proof of good rental behavior.
- Do not call a Booking Quote or Reservation Hold a confirmed Booking.
- Do not call Testnet assets real money.
