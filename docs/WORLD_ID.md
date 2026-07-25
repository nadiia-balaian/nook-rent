# World ID Host verification

## What World ID controls

World ID is the Host onboarding gate:

```text
choose Host
  -> API creates a signed RP context
  -> IDKit opens a live World App QR flow
  -> Host completes Proof of Human
  -> API verifies the profile-bound proof with World
  -> private action-specific nullifier is stored
  -> Host may continue to Listing creation
```

This is separate from the World AgentKit Guest flow. It proves a unique human
completed Host onboarding; it does not create Rental Reputation or authorize a
Guest Agent to hold dates.

## Server configuration

Create an application and relying party in the World Developer Portal. Set
these values only in the API environment:

```text
WORLD_ID_APP_ID=app_...
WORLD_ID_RP_ID=rp_...
WORLD_ID_SIGNING_KEY=0x...
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
```

The migration creates a private `nook.world_id_verifications` table with unique
profile/action and nullifier/action bindings. Public access is revoked and
row-level security is enabled without browser policies.

Applying the hosted migration is an external database write:

```bash
pnpm supabase:migrate
```

Run it only after confirming that `SUPABASE_DB_URL` points to the intended Nook
database.

## Local verification

Start the API and web application, choose **I want to rent out my place**, then
select **Verify with World ID**. Expected behavior:

1. IDKit opens the real QR/deep-link flow.
2. World App shows the Nook Host onboarding action.
3. A valid proof closes the widget and shows **World ID verified**.
4. The **Continue** button appears only after verification.
5. The API response contains no proof, nullifier, signing key, wallet, or
   personal identity data.

Official references:

- [IDKit integration](https://docs.world.org/world-id/idkit/integrate)
- [IDKit React](https://docs.world.org/world-id/idkit/react)
