# Public contributor tools

This directory contains small, public-safe utilities that contributors can run without access to CopyPump's private engineering repository.

## Devnet evidence manifest validator

`validate-devnet-evidence.mjs` checks the structure and safety boundary of a proposed CopyPump Solana Devnet lifecycle evidence manifest.

It currently validates:

- `network` is exactly `solana-devnet`;
- the lifecycle contains `BUY`, `POSITION`, `PARTIAL_SELL`, and `FULL_SELL` exactly once;
- evidence is classified as `onchain` or `application`;
- a manifest marked `verified` cannot contain simulated or unverified steps;
- verified on-chain steps include a syntactically plausible Solana transaction signature;
- public manifests do not include obvious secret-bearing fields such as private keys, seed phrases, API keys, auth tokens, or cookies.

By default the validator remains fully offline. An optional RPC identity check can be enabled with `--rpc-url`; it calls only Solana JSON-RPC `getGenesisHash`, verifies that the endpoint is Devnet, and uses a bounded timeout. The check does not sign, submit, or look up transactions.

A schema-valid manifest or successful cluster identity check does **not** prove that a transaction exists, verify balances, calculate PnL, or certify CopyPump as production-ready. These tools are only a public base for independent verification work.

## Run it

Requires Node.js 20+ and no third-party packages.

Offline/default mode:

```bash
npm test
node tools/validate-devnet-evidence.mjs examples/devnet-evidence.example.json
```

Optional Devnet RPC identity check:

```bash
node tools/validate-devnet-evidence.mjs examples/devnet-evidence.example.json \
  --rpc-url https://api.devnet.solana.com
```

The RPC timeout defaults to 5000 ms and can be bounded explicitly between 100 and 30000 ms:

```bash
node tools/validate-devnet-evidence.mjs examples/devnet-evidence.example.json \
  --rpc-url https://api.devnet.solana.com \
  --rpc-timeout-ms 3000
```

Do not commit provider URLs that contain credentials or API tokens. Errors are intentionally sanitized and do not echo the RPC URL or provider response text.

The example manifest is intentionally `draft` and contains no real transaction evidence.

## Good contribution directions

Useful follow-up contributions include:

- fail-closed Solana transaction reads with explicit v1 support and deterministic mocked fixtures;
- explorer-link consistency checks;
- balance/token-account reconciliation helpers;
- fixture coverage for failed and partially confirmed transactions;
- a machine-readable JSON Schema for the manifest format.

Keep all additions Devnet-only unless the public project status explicitly changes. Never place secrets, private wallet data, production credentials, or sensitive internal traces in public fixtures.
