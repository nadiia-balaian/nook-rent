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
  -> live World and The Graph verification badges
  -> select a seeded demo Rental Reputation profile
  -> natural-language Guest Agent search
  -> database-filtered Listing results
  -> exact Booking Quote
  -> Guest Agent receives the World AgentKit challenge and signs the protected hold
  -> live Agent0 check through The Graph
  -> automatic approval or fair Host review
  -> Hedera Testnet deposit
  -> confirmed Booking and explorer evidence
```

## Evidence labels

The UI intentionally keeps these concepts separate:

- **Demo Rental Reputation** is seeded UI data until the real HCS projection is
  implemented.
- **World connection** becomes live when AgentBook confirms the configured Guest
  Agent is human-backed.
- **Host World ID** becomes live only after the API verifies the profile-bound
  Proof of Human result. It remains separate from Guest Agent authorization and
  Rental Reputation.
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
