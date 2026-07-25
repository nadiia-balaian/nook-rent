# Nook.rent marketplace specification

Status: initial MVP baseline

Event: ETHGlobal Lisbon 2026

Target stay length: 3–90 nights

## 1. Product

Nook.rent helps people offer and book temporary homes without relying on a
centralized listing operator to manually coordinate every step. Host and Guest
Agents reduce listing and search work, but deterministic Nook.rent policy
controls availability, approval, and payment.

The first market is event-driven and temporary travel, including hackathons,
conferences, work trips, and short sublets. The product is not limited to one
event community.

## 2. Goals

- Let a Host turn structured input and photos into a reviewable Listing draft.
- Let a Guest search by city, dates, budget, and essential amenities.
- Prevent automated abuse of scarce dates with human-backed authorization.
- Support automatic approval through an explicit Host policy.
- Give newcomers a fair manual-review path.
- Protect dates with an expiring Reservation Hold.
- Lock a real Testnet deposit before confirming a Booking.
- publish pseudonymous, verifiable rental evidence without exposing private
  information.
- Turn completed rental behavior into portable Rental Reputation.

## 3. Non-goals for the hackathon baseline

- Fiat settlement or production-value custody.
- Insurance, arbitration, or automated dispute judgment.
- Government identity, age, or jurisdiction checks.
- Automated proof that a Host may legally sublet a property.
- External calendar synchronization.
- Dynamic pricing based on an unsupported or mocked demand feed.
- A universal score inferred from wallet wealth or general Web3 activity.
- Production delivery of door codes or sensitive access information.

Property control is a disclosed demo limitation until a real verification flow
exists.

## 4. Rental model

- A stay is measured in nights between local check-in and check-out dates.
- Minimum stay: 3 nights.
- Maximum stay: 90 nights.
- A Listing publishes a nightly rate.
- A Booking Quote derives:
  - number of nights;
  - stay subtotal;
  - reputation-adjusted deposit;
  - total amount due;
  - quote expiry.
- The Guest confirms the exact quote before requesting a hold.
- Currency display and Testnet settlement denomination must be labeled
  separately. A displayed fiat estimate is not a Hedera price guarantee.

## 5. Member roles

A Member can be a Host, a Guest, or both.
World ID verification belongs to the Member profile, not to a role. A verified
Member who changes between Host and Guest is not asked to repeat the same
action.

### Host

- completes World ID Member verification;
- creates and reviews Listing drafts;
- controls Availability Windows and house rules;
- selects an Approval Policy;
- reviews requests that do not qualify for automatic approval;
- participates in checkout and escrow release.

### Guest

- completes World ID Member verification;
- proves human-backed control of the Guest Agent;
- searches and compares Listings;
- reviews a Booking Quote;
- requests a Reservation Hold;
- funds the required Testnet escrow;
- participates in checkout;
- earns Rental Reputation from defined outcomes.

## 6. Host flow

1. Create a Nook.rent profile.
2. Complete World ID Member verification.
3. Provide Listing details, photos, approximate location, amenities, rules,
   nightly rate, and available dates.
4. The Host Agent prepares a structured draft and clearly marks inferred
   content.
5. The Host reviews and explicitly publishes the Listing.
6. The Host selects an Approval Policy.
7. Qualifying requests may be approved automatically.
8. Other requests appear in a Host review queue.
9. Exact address and Check-in Instructions remain private until the Booking
   reaches the appropriate state.

An AI-generated Listing never becomes public without Host confirmation.

## 7. Guest flow

1. Create a Nook.rent profile.
2. Complete World ID Member verification.
3. Connect a World-backed Guest Agent with the required live Agent capability.
4. Ask the Guest Agent for a city, date range, budget, occupancy, and essential
   amenities.
5. Nook.rent applies hard filters to stored Listing data.
6. The Guest Agent ranks only valid results and explains the match.
7. The Guest either reviews a Listing manually or authorizes a one-time Agent
   Mandate to select the top valid match, accept its deterministic Booking
   Quote, and request one Reservation Hold.
8. The Guest reviews public Host information, named Onchain Signals, Rental
   Reputation where available, and the Booking Quote.
9. Nook.rent evaluates the Host's Approval Policy.
10. The request is approved automatically or sent to Host review.
11. The Guest funds escrow.
12. Nook.rent confirms the Booking only after the hold and financial operation
    are reconciled.

## 8. Approval

Automatic approval is available only when the Host enables it.

The baseline automatic-approval policy requires:

- an active Listing;
- dates inside an Availability Window;
- no conflicting active hold or confirmed Booking;
- a human-backed Guest Agent;
- a live registered Agent identity with the required booking capability;
- Guest acceptance of house rules;
- occupancy within the Listing limit;
- a qualifying Rental Reputation tier;
- sufficient funding for the stored deposit quote.

Failure to meet automatic-approval policy does not mean rejection. It creates a
standard Host review path.

Newcomers have no negative history. The baseline must not label them risky or
infer risk from missing wallet activity.

## 9. World

World has two deliberately separate responsibilities:

- World ID provides an action-specific Proof of Human for every Member before
  protected Host or Guest actions;
- World AgentKit provides human-backed authorization for protected Guest Agent
  actions.

The integrations must be meaningful and end to end:

- a Host or Guest cannot continue through onboarding until World ID is
  verified;
- a Guest cannot connect the Guest Agent until the Guest profile has a valid
  Member verification;
- an unverified Agent can browse public Listings;
- an unverified Agent cannot reserve dates or initiate payment;
- a verified human-backed Agent can execute one Guest-approved Agent Mandate
  and request one valid hold;
- replay and repeated-hold abuse are prevented per anonymous human.

World proofs are processed server-side and are not published to HCS. Member
World ID verification stores only the private action-specific nullifier
required to prevent reuse; the browser receives only a verified result.

## 10. The Graph

The Graph provides live Onchain Signals through a Graph provider. The baseline
queries a live agent registry to verify:

- Agent registration;
- signing wallet or operator binding;
- active registration state;
- advertised Nook.rent booking capability.

The optional consented wallet flow queries indexed ENS ownership through The
Graph and displays the result by name. It does not add Rental Reputation and
does not authorize payment by itself.

After direct Guest verification, the Guest may optionally connect an EVM wallet
through Reown. Nook.rent issues a short-lived, purpose-bound message and reads
public ENS ownership through The Graph plus POAP participation through POAP
Compass only after the Guest signs it. The results are displayed as separately
named wallet evidence and are never converted into Rental Reputation or
automatic-approval eligibility. Missing wallet history remains neutral.

Mocked Graph responses may support local unit tests but never count as sponsor
evidence.

## 11. Hedera

Hedera Testnet supplies the financial and public-evidence path:

- HTS test token for deposit and booking-payment flows;
- Schedule Service where delayed or signature-gated execution adds value;
- HCS for versioned, pseudonymous Booking events;
- Mirror Node for authoritative read-back and evidence links.

The demo must execute a real Testnet financial operation. A visual-only escrow
state is not sufficient.

HCS uses a shared environment topic. Events contain opaque Nook.rent references,
state transitions, and transaction references—not exact addresses, access
instructions, World identifiers, or raw identity proofs.

## 12. Listing and availability

A public Listing includes:

- title and description;
- photos suitable for public display;
- city, neighborhood, and approximate map area;
- amenities and occupancy;
- house rules;
- nightly rate;
- Availability Windows;
- Host-confirmed Agent-generated content markers.

Exact street address is not public.

The availability service must exclude overlapping live holds and confirmed
Bookings during discovery, then atomically repeat that protection when the Hold
is created.

## 13. Reservation Hold

A Reservation Hold:

- belongs to one Listing, Guest, and date range;
- references the accepted Booking Quote;
- has a short expiry;
- prevents overlapping holds;
- is idempotent for the same request;
- converts into a Booking only after approval and escrow success;
- releases dates after rejection, expiry, cancellation, or unrecoverable
  payment failure.

When a Hold expires before confirmation, any still-pending Booking expires with
it. A submitted financial Operation remains reconcilable if authoritative
provider evidence later confirms it.

## 14. Booking lifecycle

```text
request_received
  -> approval_pending
  -> awaiting_deposit
  -> confirmed
  -> checked_in
  -> checkout_pending
  -> completed
```

Allowed terminal or exceptional states:

```text
rejected
expired
cancelled
disputed
```

State transitions occur through application services, never through direct
browser database writes.

## 15. Rental Reputation

The initial rule set may award or subtract deterministic contributions for:

- Booking completed;
- Booking payment completed;
- both parties confirmed checkout;
- cancellation under a defined policy;
- confirmed dispute outcome.

Rules must be versioned, ordered, deduplicated, explainable, and testable.

Host reputation is a separate future decision. The MVP must not display a
default Host score as earned history.

## 16. AI boundaries

Allowed:

- turn Host-provided facts and photos into a Listing draft;
- detect possible amenities and ask for confirmation;
- translate a Guest request into structured filters;
- rank already-valid Listings;
- explain approval outcomes;
- prepare non-sensitive messages.

Forbidden:

- invent Listing facts;
- publish without Host confirmation;
- decide whether a person is trustworthy;
- choose dates, token, amount, recipient, deposit, or approval threshold;
- handle signing secrets;
- expose Check-in Instructions;
- override availability or stored policy.

The Guest Agent may select the highest-ranked Listing only after deterministic
hard filtering. It may create the stored quote and request a hold under a
one-time Agent Mandate. The Agent does not approve the request: the stored Host
Approval Policy returns automatic approval or the Host review path.

## 17. MVP API surface

The exact HTTP representation may evolve, but the MVP requires these
capabilities:

```text
POST   /v1/profiles
POST   /v1/agents/verify
GET    /v1/world-id/member/config
GET    /v1/world-id/member/status
POST   /v1/world-id/member/rp-signature
POST   /v1/world-id/member/verify
POST   /v1/agents/guest/world-connection
POST   /v1/agents/guest/search
POST   /v1/agents/guest/secure-match
POST   /v1/listings/drafts
POST   /v1/listings
GET    /v1/listings
GET    /v1/listings/:listingId
POST   /v1/booking-quotes
POST   /v1/reservation-holds
POST   /v1/booking-requests/:requestId/decision
POST   /v1/bookings/:bookingId/deposit
GET    /v1/bookings/:bookingId
GET    /v1/profiles/:profileId/reputation
GET    /v1/profiles/:profileId/history
```

Protected mutations require an authenticated profile, a signed request, an
idempotency key, and the appropriate Agent capability.

## 18. Demo acceptance scenario

Seed:

- two Lisbon Listings with distinct dates and rules;
- one experienced Guest whose Rental Reputation qualifies for automatic
  approval;
- one Newcomer who follows Host review;
- one unverified Agent used for a negative authorization demonstration.

The demo succeeds when it shows:

1. Host Agent creates a Listing draft and Host publishes it.
2. Host and Guest complete direct World ID Member onboarding.
3. Guest Agent finds a valid Listing for 3–90 nights.
4. Guest authorizes one Agent Mandate and the Agent secures the top valid match.
5. An unverified Member or Agent is denied a hold.
6. A human-backed Agent passes World authorization.
7. The Graph supplies a live Agent registration signal.
8. Experienced Guest receives automatic approval from stored Host policy.
9. Newcomer receives fair Host review.
10. A real Hedera Testnet deposit operation succeeds.
11. Mirror Node confirms the transaction and HCS event.
12. Conflicting dates cannot be booked twice.
