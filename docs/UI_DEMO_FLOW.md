# Nook.rent guided demo flow

Status: implemented UI tracer

The web application uses one calm, screen-by-screen story instead of exposing
all marketplace controls at once.

## Host path

```text
Splash
  -> choose Host
  -> World authorization explanation
  -> signal separation
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
  -> World authorization explanation
  -> signal separation
  -> select a seeded demo Rental Reputation profile
  -> natural-language Guest Agent search
  -> database-filtered Listing results
  -> exact Booking Quote
  -> World and Agent0 protected hold
  -> automatic approval or fair Host review
  -> Hedera Testnet deposit
  -> confirmed Booking and explorer evidence
```

## Evidence labels

The UI intentionally keeps these concepts separate:

- **Demo Rental Reputation** is seeded UI data until the real HCS projection is
  implemented.
- **World** becomes live evidence only when the protected hold response confirms
  human-backed authorization.
- **The Graph** becomes live evidence only when the hold response contains the
  active Agent0 capability signal.
- **Hedera** becomes live evidence only after Mirror Node confirms the Testnet
  operation and the API returns its public links.

Onboarding previews do not claim that provider verification has already
happened.

## Visual system

- Woven Linen background: `#F5F0E7`
- Surface cards: `#FFFCF7`
- Hearth Pine actions and headings: `#315C55`
- Welcome Clay accents: `#B9634F`
- Newsreader headings, Figtree body copy, and DM Mono evidence values
- calm opacity transitions with reduced-motion support
- responsive layouts verified at desktop and 390px mobile width

The Listing photos are project-owned generated demo assets under
`apps/web/public/images/`.
