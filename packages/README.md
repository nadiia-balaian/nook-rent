# Packages

Current packages:

- `core`: domain rules, workflows, state machines, and provider ports;
- `config`: typed environment parsing;
- `ai`: constrained Listing and search adapters;
- `hedera`: native Hedera Testnet adapter;
- `world`: human-backed Agent authorization adapter;
- `the-graph`: live Subgraph adapter;
- `supabase`: persistence repositories.

Provider packages implement ports owned by `core`. They do not call one another
or contain cross-provider orchestration.

`core`, `config`, and the server-side `supabase` adapter contain implemented
behavior. Other provider packages are explicit boundaries for later adapters
and do not claim live integrations.
