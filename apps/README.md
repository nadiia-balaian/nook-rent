# Applications

Runtime applications will be scaffolded in the next implementation phase.

Planned ownership:

- `web`: marketplace and sponsor-evidence presentation;
- `api`: HTTP boundary and provider composition root;
- `worker`: durable Agent jobs, hold expiry, and external reconciliation.

Applications may depend on packages. Packages must not depend on applications.
