# Nook.rent guided demo flow

Status: implemented UI tracer

The web application uses one calm, screen-by-screen story instead of exposing
all marketplace controls at once.

## Host path

```text
Splash
  -> choose Host
  -> live World ID Proof of Human in World App
  -> compact private-verification badge
  -> confirmed Listing facts and demo photos
  -> Host Agent draft
  -> Host edits and confirms Agent suggestions
  -> Host sets dates, price, deposit, and approval policy
  -> reviewable Listing draft
  -> explicit publication
```

The Agent may draft public copy. It never chooses the dates, price, deposit,
approval threshold, settlement token, or publication action.

## Guest path

```text
Splash
  -> choose Guest
  -> live World ID Member Proof of Human
  -> connect the World-backed Guest Agent
  -> live World Agent and The Graph verification badges
  -> select a seeded demo Rental Reputation profile
  -> natural-language Guest Agent search
  -> database-filtered Listing results
  -> Guest authorizes one secure-and-fund Agent Mandate with a Testnet deposit cap
  -> Agent selects the top valid result and creates the exact Booking Quote
  -> Guest Agent receives the World AgentKit challenge and signs one protected hold
  -> live Agent0 check through The Graph
  -> stored Host policy returns automatic approval or fair Host review
  -> Agent automatically triggers the exact stored Hedera Testnet deposit
  -> confirmed Booking and explorer evidence
```

The manual Listing detail and quote path remains available for comparison. The
Agentic path uses the same deterministic quote, hold, availability, and approval
services. The secure-and-fund action is the Guest's payment authorization; the
Agent path does not show a second “Fund deposit” button. For Host review, the
mandate waits until the Host approves and then settles automatically.

## Evidence labels

The UI intentionally keeps these concepts separate:

- **Demo Rental Reputation** is seeded UI data until the real HCS projection is
  implemented.
- **Member World ID** becomes live only after the API verifies the
  profile-bound Proof of Human result for either Host or Guest.
- **World Agent connection** becomes live when AgentBook confirms the configured
  Guest Agent is human-backed. It remains separate from direct Member
  verification and Rental Reputation.
- **The Graph** becomes live evidence when onboarding finds the active Agent0
  capability signal. The protected hold checks World and The Graph again before
  dates can be reserved.
- **Hedera** becomes live evidence only after Mirror Node confirms the Testnet
  operation and the API returns its public links.

Onboarding previews do not claim that provider verification has already
happened.

## Visual system

- Woven Linen background: `#F5F0E7`
- Surface cards: `#FFFCF7`
- Hearth Pine actions and headings: `#315C55`
- Welcome Clay accents: `#B9634F`
- Fraunces headings, DM Sans body copy, and DM Mono evidence values
- a Privacy First explanation on the verification screen
- calm opacity transitions with reduced-motion support
- mobile-first landing and onboarding layouts, verified at 390px and desktop
  widths

The Listing photos are project-owned generated demo assets under
`apps/web/public/images/`.
