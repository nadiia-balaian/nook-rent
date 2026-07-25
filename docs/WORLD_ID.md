# World ID Member verification

## What World ID controls

World ID is the direct onboarding gate for every Nook.rent Member:

```text
choose Host or Guest
  -> API creates a signed RP context
  -> IDKit opens a live World App QR flow
  -> Member completes Proof of Human
  -> API verifies the profile-bound proof with World
  -> private action-specific nullifier is stored
  -> Host may create a Listing
  -> Guest may connect a World-backed Agent
```

This is separate from the World AgentKit Guest flow. Direct Member verification
proves a unique person completed onboarding. AgentKit then proves that the
server-side Guest Agent is acting for a verified human when it requests a
protected hold. Neither creates Rental Reputation.

## Server configuration

Create an application and relying party in the World Developer Portal. Set
these values only in the API environment:

```text
WORLD_ID_APP_ID=app_...
WORLD_ID_RP_ID=rp_...
WORLD_ID_SIGNING_KEY=0x...
WORLD_ID_ACTION=nook-member-onboarding
WORLD_ID_ENVIRONMENT=production
```

Use `staging` or `sandbox` only when the matching Developer Portal setup and
World App flow require it. Never expose the signing key through a `VITE_`
variable.

The browser receives only the application ID, relying-party ID, action,
environment, and short-lived signed RP context. The API verifies the resulting
proof and never returns its nullifier.

## Database setup

Review and explicitly apply:

```text
supabase/migrations/202607250006_world_id_host_verification.sql
supabase/migrations/202607250007_world_id_member_verification.sql
```

The first migration creates the private `nook.world_id_verifications` table.
The second generalizes the stored role from Host to Member. The final table has
unique profile/action and nullifier/action bindings. Public access is revoked
and row-level security is enabled without browser policies.

Applying the hosted migration is an external database write:

```bash
pnpm supabase:migrate
```

Run it only after confirming that `SUPABASE_DB_URL` points to the intended Nook
database.

## Local verification

Start the API and web application, choose either role, then select **Verify with
World ID**. Expected behavior:

1. IDKit opens the real QR/deep-link flow.
2. World App shows the Nook Member onboarding action.
3. A valid proof closes the widget and shows **World ID verified**.
4. A Host may continue to Listing creation.
5. A Guest may then connect the World-backed Agent; the connection and
   protected hold both require the Guest profile's direct verification.
6. The API response contains no proof, nullifier, signing key, wallet, or
   personal identity data.

Official references:

- [IDKit integration](https://docs.world.org/world-id/idkit/integrate)
- [IDKit React](https://docs.world.org/world-id/idkit/react)
