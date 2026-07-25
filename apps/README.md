# Applications

Current ownership:

- `web`: marketplace and sponsor-evidence presentation;
- `api`: HTTP boundary and provider composition root;
- `worker`: durable Agent jobs, hold expiry, and external reconciliation.

Applications may depend on packages. Packages must not depend on applications.

The API and web application now form the marketplace tracer: Listing creation
and search, exact quotes, Reservation Holds, automatic or manual approval, and
both Guest and Host UI paths. They also expose the Phase 5 Hedera deposit,
manual reconciliation, and evidence flow when Testnet configuration is present.
The worker remains a thin shell until background Operation claiming and
reconciliation are introduced.
