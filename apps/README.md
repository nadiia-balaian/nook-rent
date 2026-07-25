# Applications

Current ownership:

- `web`: marketplace and sponsor-evidence presentation;
- `api`: HTTP boundary and provider composition root;
- `worker`: durable Agent jobs, hold expiry, and external reconciliation.

Applications may depend on packages. Packages must not depend on applications.

The Phase 1 applications are intentionally thin shells. Marketplace routes,
durable jobs, and UI flows are added through later tracer-bullet phases.
