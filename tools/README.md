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

By default the validator remains fully offline. An optional RPC identity check can be enabled with `--rpc-url`; it calls only Solana JSON-RPC `getGenesisHash`, verifies that the endpoint is Devnet, and uses a bounded timeout. The validator itself does not sign or submit transactions.

A schema-valid manifest or successful cluster identity check does **not** prove that a transaction exists, verify balances, calculate PnL, or certify CopyPump as production-ready. These tools are only a public base for independent verification work.

## Read-only Devnet transaction helper

`read-devnet-transaction.mjs` provides a bounded, read-only transaction lookup helper for public verification tooling. It remains offline unless both an RPC URL and transaction signature are supplied, verifies the endpoint is Solana Devnet first, then calls `getTransaction` with `maxSupportedTransactionVersion: 1` and a bounded timeout.

The decoded JSON-RPC response is passed through `classify-transaction-read-response.mjs`, which distinguishes successful reads, `result: null`, RPC `-32015`, on-chain failures (`meta.err`), other RPC errors, and malformed responses without reflecting provider error text into normalized output.

This helper does **not** connect a wallet, sign or submit transactions, retry state-changing operations, support Mainnet, or prove that CopyPump's trading lifecycle is complete.

## Offline v1 resource-policy and recovery models

Issue [#9](https://github.com/CopyPumpApp/CopyPump/issues/9) has two zero-dependency, pure modules:

- `validate-send-safety.mjs` exports `validateSendSafety(input, policy, { nowMs })`. It checks supplied Devnet v1 configuration against measured compute/data use, explicit bounded headroom, exact integer fee caps, message bindings, evidence freshness and a recent-blockhash lifetime. All five evidence/lifetime/current sections explicitly use this model's fixed `confirmed` commitment contract. It returns `POLICY_CONSISTENT` or `HOLD` with static reason codes.
- `classify-submission-recovery.mjs` exports `classifySubmissionRecovery(attempt, observation)`. It checks the identity and freshness of a receipt for a persisted attempt. Unknown or expired-null outcomes retain the reservation; finalized outcomes request reconciliation and retain the reservation until that accounting is complete.

**Neither module authorizes sending.** Every result has `sendAuthorized: false`; recovery also has `replacementAllowed: false`. They perform no RPC, wallet access, signing, submission, storage or implicit clock reads. They are reference models for normalized JSON, not an RPC adapter or integrated trading guard.

Digests, source labels, lifetime pairing and durable state must come from a separately trusted adapter. The functions check supplied relationships; they do not authenticate those claims. Fee amounts use canonical u64 decimal strings rather than JavaScript numbers. All policy thresholds are explicit caller inputs; fixture settings are synthetic test data. See the [full contract and official sources](../docs/SOLANA_V1_SEND_SAFETY_DRAFT.md).

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

The transaction-read helper is exercised through deterministic mocked tests in `test/read-devnet-transaction.test.mjs`; CI does not require a live RPC endpoint.

Do not commit provider URLs that contain credentials or API tokens. Errors are intentionally sanitized and do not echo the RPC URL or provider response text.

The example manifest is intentionally `draft` and contains no real transaction evidence.

Run the two offline review examples from the repository root:

```bash
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { validateSendSafety } from './tools/validate-send-safety.mjs';
const fixture = JSON.parse(readFileSync('./examples/send-safety.example.json', 'utf8'));
console.log(validateSendSafety(fixture.input, fixture.policy, { nowMs: fixture.nowMs }));
JS

node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { classifySubmissionRecovery } from './tools/classify-submission-recovery.mjs';
const fixture = JSON.parse(readFileSync('./examples/submission-recovery.example.json', 'utf8'));
console.log(classifySubmissionRecovery(fixture.attempt, fixture.observation));
JS
```

The first example returns `POLICY_CONSISTENT` with `sendAuthorized: false`. The second returns `unknown_expired`, `HOLD`, `KEEP` and `replacementAllowed: false`. `npm test` runs their deterministic positive and negative cases together with the existing public-tool tests. No synthetic result is real Devnet lifecycle evidence for issue #2.

## Good contribution directions

Useful follow-up contributions include:

- explorer-link consistency checks;
- balance/token-account reconciliation helpers;
- fixture coverage for failed and partially confirmed transactions;
- a machine-readable JSON Schema for the manifest format;
- security review of future transaction-policy validation before any signing/submission capability is considered.

Keep all additions Devnet-only unless the public project status explicitly changes. Never place secrets, private wallet data, production credentials, or sensitive internal traces in public fixtures.
