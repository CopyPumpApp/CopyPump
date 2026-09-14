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

It **does not** query Solana RPC, prove that a transaction exists, verify balances, calculate PnL, or certify CopyPump as production-ready. A schema-valid manifest is only a better input for independent review.

## Run it

Requires Node.js 20+ and no third-party packages.

```bash
npm test
node tools/validate-devnet-evidence.mjs examples/devnet-evidence.example.json
```

The example is intentionally `draft` and contains no real transaction evidence.

## Good contribution directions

Useful follow-up contributions include:

- optional Solana Devnet RPC verification for supplied transaction signatures;
- explorer-link consistency checks;
- balance/token-account reconciliation helpers;
- fixture coverage for failed and partially confirmed transactions;
- a machine-readable JSON Schema for the manifest format.

Keep all additions Devnet-only unless the public project status explicitly changes. Never place secrets, private wallet data, production credentials, or sensitive internal traces in public fixtures.
