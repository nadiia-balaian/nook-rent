# Nook.rent Hedera Testnet resources

Created: 2026-07-25

Network: Hedera Testnet

Status: resource setup, live Booking deposit, HCS evidence, and idempotent retry
verified

## Public resources

- HTS demo settlement token:
  [0.0.9747206](https://hashscan.io/testnet/token/0.0.9747206)
- HCS public Booking evidence topic:
  [0.0.9747207](https://hashscan.io/testnet/topic/0.0.9747207)

The token has two decimals and an initial treasury supply of 10,000,000 atomic
units. The escrow account is associated with the token.

## Setup evidence

- [Token creation transaction](https://hashscan.io/testnet/transaction/0.0.9581470%401784996761.456161436)
- [Topic creation transaction](https://hashscan.io/testnet/transaction/0.0.9581470%401784996763.003893687)
- [Escrow association transaction](https://hashscan.io/testnet/transaction/0.0.9581470%401784996766.911212791)

The post-creation preflight verified:

- both configured accounts exist on Testnet;
- the operator signer matches its account;
- the escrow signer matches its account;
- both accounts are associated with the HTS token;
- the operator holds the initial token supply;
- the token and HCS topic are readable through Mirror Node.

## Live Phase 5 exit evidence

- Deposit amount: 50,000 atomic units
- [Confirmed HTS deposit transaction](https://hashscan.io/testnet/transaction/0.0.9581470%401784997058.668178633)
- [Confirmed HCS evidence transaction](https://hashscan.io/testnet/transaction/0.0.9581470%401784997070.664189646)
- HCS topic sequence: 1
- Final operator balance: 9,950,000 atomic units
- Final escrow balance: 50,000 atomic units

The first request returned a durable `reconciling` Operation while Mirror Node
was indexing the confirmed transfer. Reconciliation then atomically:

- funded the Escrow;
- confirmed the Payment;
- confirmed the Booking;
- converted the Reservation Hold;
- published and read back `booking.deposit.funded` evidence.

Retrying the original deposit idempotency key returned the same HTS transaction,
the same HCS transaction and sequence, and an attempt count of one.

The HCS payload contains only:

- public evidence reference;
- deposit transaction ID;
- token ID and atomic amount;
- network and funded state.

No private key, database credential, identity proof, address, or Check-in
Instruction is stored in this file or published to HCS.

The implementation and this evidence record are versioned together in the
Phase 5 repository history.
