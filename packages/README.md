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

`core`, `config`, the server-side `supabase` adapter, and the native `hedera`
adapter contain implemented behavior. The Hedera adapter has verified live
Testnet HTS, Mirror Node, and HCS evidence. `world`, `the-graph`, and `ai` remain
explicit boundaries for later adapters.
