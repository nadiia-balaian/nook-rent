# Nook.rent deployment

Nook.rent has two deployable projects. Supabase, Hedera, World, and The Graph
remain managed integrations.

## 1. API project

Create or configure the Vercel project with:

- project name: `nook-rent-api`
- root directory: `apps/api`
- framework preset: Fastify
- build command: use the framework default
- output directory: use the framework default
- Node.js: 24

The Fastify entrypoint is `apps/api/src/app.ts`. Vercel requires a recognized
`app`, `index`, or `server` entrypoint to route requests to the Fastify
function.

Set API environment variables for Production:

```text
NODE_ENV=production
SUPABASE_DB_URL=<hosted Supabase pooler URI>
ALLOWED_ORIGINS=https://nook-rent-web.vercel.app,https://nook.rent,https://www.nook.rent

HEDERA_NETWORK=testnet
HEDERA_OPERATOR_ACCOUNT_ID=<testnet operator>
HEDERA_OPERATOR_PRIVATE_KEY=<testnet operator key>
HEDERA_TOKEN_ID=<test token>
HEDERA_HCS_TOPIC_ID=<test topic>
HEDERA_ESCROW_ACCOUNT_ID=<testnet escrow>
HEDERA_MIRROR_NODE_URL=https://testnet.mirrornode.hedera.com

WORLD_AGENTKIT_RESOURCE_URI=https://nook-rent-api.vercel.app/v1/reservation-holds
WORLD_HUMAN_REFERENCE_SECRET=<at least 32 random characters>
WORLD_AGENT_WALLET_PRIVATE_KEY=<registered Agent wallet key>
WORLD_ID_APP_ID=<World app id>
WORLD_ID_RP_ID=<World relying-party id>
WORLD_ID_SIGNING_KEY=<World signing key>
WORLD_ID_ENVIRONMENT=production

THE_GRAPH_API_KEY=<gateway API key>
THE_GRAPH_AGENT0_SUBGRAPH_ID=4yYAvQLFjBhBtdRCY7eUWo181VNoTSLLFd5M7FXQAi6u
THE_GRAPH_AGENT0_CHAIN_ID=84532
THE_GRAPH_REQUIRED_CAPABILITY=nook.rent:reservation-hold

OPENAI_API_KEY=<project API key>
OPENAI_MODEL=gpt-5.6-sol
```

`WORLD_CHAIN_RPC_URL`, Graph gateway/timeouts, and OpenAI timeout can use their
documented defaults.

After deployment, both endpoints must succeed:

```text
https://nook-rent-api.vercel.app/health
https://nook-rent-api.vercel.app/ready
```

## 2. Web project

Import the same GitHub repository as a second Vercel project:

- project name: `nook-rent-web`
- root directory: `apps/web`
- framework preset: Vite
- build command: use the framework default
- output directory: use the framework default (`dist`)
- Node.js: 24

Set one Production environment variable:

```text
VITE_API_URL=https://nook-rent-api.vercel.app
```

Deploy the API first. Then deploy the web project and add its exact production
origin to the API project's `ALLOWED_ORIGINS`. Redeploy the API after changing
that value.

## Verification

1. Open the API `/health` endpoint and expect `status: "ok"`.
2. Open `/ready` and expect `status: "ready"`.
3. Open the web deployment and confirm it does not show the API-unavailable
   banner.
4. Complete the Guest verification step and confirm both World and The Graph
   badges appear.
5. Complete the Host verification step in World App.
6. Create a Listing, search, quote, hold, and Testnet deposit.

Never put private keys or service credentials in the web project.
