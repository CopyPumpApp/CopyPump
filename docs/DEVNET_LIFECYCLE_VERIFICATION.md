# Devnet tracked-account receipt verification

Status: **read-only public reference tool; complete lifecycle verification remains open**.

[`reconcile-devnet-lifecycle.mjs`](../tools/reconcile-devnet-lifecycle.mjs) compares a manifest with supplied RPC evidence without I/O. [`verify-devnet-lifecycle.mjs`](../tools/verify-devnet-lifecycle.mjs) optionally collects that evidence from an explicitly selected Devnet RPC endpoint. Neither module connects a wallet, signs, sends transactions, implements trading, or authorizes execution.

## Run from the repository root

Requires Node.js 20+; no third-party packages are needed. The CLI is offline unless `--rpc-url` or `COPYPUMP_DEVNET_RPC_URL` supplies a URL. Clear the environment variable to guarantee an offline invocation:

```bash
COPYPUMP_DEVNET_RPC_URL= node tools/verify-devnet-lifecycle.mjs \
  examples/devnet-lifecycle.example.json
```

This returns `DEVNET_LIFECYCLE_READ_SKIPPED`. Here `ok: true` means the manifest passed structural checks; `receiptEvidenceVerified` and `lifecycleVerified` remain `false`.

Exercise the pure reconciler with both synthetic fixtures:

```bash
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
import { reconcileDevnetLifecycle } from './tools/reconcile-devnet-lifecycle.mjs';
const manifest = JSON.parse(readFileSync('./examples/devnet-lifecycle.example.json', 'utf8'));
const evidence = JSON.parse(readFileSync('./examples/devnet-lifecycle-rpc-fixtures.json', 'utf8'));
console.log(JSON.stringify(reconcileDevnetLifecycle(manifest, evidence), null, 2));
JS
```

The fixtures return `RECEIPTS_MATCH_EXPECTATIONS`; their addresses, signatures and receipts are synthetic and are **not real Devnet evidence**.

For an online read, replace the path below with an operator-reviewed manifest containing real Devnet signatures and expected account effects. Do not use the synthetic manifest as real evidence:

```bash
node tools/verify-devnet-lifecycle.mjs ./reviewed-devnet-lifecycle.json \
  --rpc-url https://api.devnet.solana.com \
  --rpc-timeout-ms 5000
```

Alternatively set `COPYPUMP_DEVNET_RPC_URL` to the reviewed HTTPS endpoint; an explicit CLI URL takes precedence. Do not commit provider credentials. The CLI exits `0` for an accepted result, including offline validation, `1` for a rejected verification/read, and `2` for invalid CLI input or an unreadable JSON file. Inspect the scope flags as well as the exit code.

## Bounded RPC collection

A complete collection makes five sequential, read-only JSON-RPC calls over **HTTP POST**. It performs no state-changing RPC method, retry, polling or endpoint discovery.

| Request ID | Method | Binding |
| --- | --- | --- |
| `1` | `getGenesisHash` | Require `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` (Devnet). |
| `2` | `getSignatureStatuses` | The three manifest signatures in order; `searchTransactionHistory: true`. |
| `3`, `4`, `5` | `getTransaction` | One requested signature each; `commitment: "finalized"`, `encoding: "json"`, `maxSupportedTransactionVersion: 1`. |

Invalid input, a cluster mismatch, or a transport/RPC error can stop collection before five calls. The manifest is copied before the first asynchronous read so caller mutations cannot change the validated expectations during collection. URLs must use HTTPS without embedded username/password or a fragment; redirects are rejected. Normalized failures do not echo provider error text or the URL.

The timeout defaults to 5,000 ms and accepts 100–30,000 ms **per request**, covering both fetch and the response body. Each response is capped at 1,000,000 bytes and 4,096 nonempty stream chunks; empty chunks are rejected. The JavaScript API can lower `maxResponseBytes`, but cannot raise the cap. There is no unbounded body-reading fallback or retry after a limit failure.

The official contracts describe [genesis identity](https://solana.com/docs/rpc/http/getgenesishash), [historical status lookup](https://solana.com/docs/rpc/http/getsignaturestatuses) and [transaction retrieval](https://solana.com/docs/rpc/http/gettransaction). Status lookup has no commitment request field: the verifier checks the returned `confirmationStatus`. A null result or missing historical metadata is insufficient evidence, not proof of non-execution. A provider's replies remain trusted RPC data, not an independently authenticated ledger proof.

## Manifest contract

[`devnet-lifecycle.example.json`](../examples/devnet-lifecycle.example.json) defines the exact supported shape. Unexpected manifest fields are rejected. This is a separate schema from the older `devnet-evidence.example.json` manifest.

| Field | Required meaning |
| --- | --- |
| `schemaVersion`, `network` | `1` and exactly `solana-devnet`. |
| `owner`, `positionMint`, `positionTokenAccount` | Three distinct, valid 32-byte Base58 account addresses. Exactly one token account is tracked. |
| `decimals` | One integer from 0 through 255, matching every selected token-balance entry. |
| `position.afterOperationId`, `position.rawAmount` | Bind the position expectation to the BUY operation ID and its expected post amount; no fourth transaction is implied. |
| `trades` | Exactly `BUY`, `PARTIAL_SELL`, `FULL_SELL`, in that order, with distinct operation IDs and distinct valid 64-byte Base58 signatures. |
| Each trade's expected fields | `expectedPreAmount`, `expectedPostAmount`, `expectedFeeLamports`, and signed `expectedOwnerLamportDelta`. |

Expected amounts are canonical decimal strings, without fractions, exponent notation or leading zeros. Unsigned values are bounded by u64; the owner delta permits an optional minus sign with magnitude up to u64. Plus signs and negative zero are rejected. Token arithmetic uses `BigInt` on raw `uiTokenAmount.amount`; display values such as `uiAmount` are not used.

The required account sequence is `0 → B → P → 0`, where `B > P > 0`. Adjacent expected balances must match exactly, and `position.rawAmount` must equal `B`. These are caller-supplied expectations. Operation IDs are not Solana receipt fields and do not prove that CopyPump originated a transaction or recorded an application position.

## Receipt checks and supported account scope

Every status must show finalized success with explicit null `err` and `confirmations`. Each transaction must have non-null metadata, `meta.err === null`, the expected first signature, the matching status slot and a slot no later than the status response context. JSON-RPC IDs and the collected request signature/commitment are checked. Signature decoding checks byte length and identity; it does not cryptographically verify signatures or reconstruct the message.

Only raw JSON legacy, v0 and v1 transaction shapes are supported. The effective key order is static `message.accountKeys`, then v0 loaded writable addresses, then loaded readonly addresses. Lookup counts, unique keys, index bounds, signature counts and header readonly partitions are checked. A changed tracked token account must be writable; an owner with a lamport delta must also be writable. The first static key identifies the fee payer. V1 must have its supported `transactionConfig` shape and no address-table lookups; this does not repeat the separate v1 send-policy review. See [versioned transactions](https://solana.com/docs/core/transactions/versioned-transactions) and [RPC JSON structures](https://solana.com/docs/rpc/json-structures).

The supported scope is **one preexisting classic SPL Token account that stays open**. Every transaction must contain explicit pre and post token-balance entries for that account with the same owner, mint, decimals and classic program ID `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`. Both account lamport balances must be positive. Missing entries are never silently replaced with zero. Creation/closure decoding, Token-2022 and ownership changes are unsupported; metadata checks alone do not decode an account's internal lifecycle. Official guidance describes [new-account balance omissions and ownership accounting](https://solana.com/docs/defi/exchange) and [account closure](https://solana.com/docs/tokens/basics/close-account).

All numeric RPC fees and pre/post lamport balances must be nonnegative JavaScript safe integers before conversion to `BigInt`. Unsafe values are rejected; a lossless JSON-number parser is not implemented. Converting an already rounded number to a decimal string cannot restore precision. The full balance arrays must match the effective account-key count.

Slots must increase strictly from BUY to PARTIAL_SELL to FULL_SELL. Equal or decreasing slots produce `TRANSACTION_ORDER_UNPROVEN` and require further review. `getTransaction` has no transaction index within a block, so manifest order, RPC response order and `blockTime` cannot resolve same-slot chronology. This tool does not call [getBlock](https://solana.com/docs/rpc/http/getblock) or implement that additional ordering proof.

## What a result establishes

A successful reconciliation has `verificationScope: "DEVNET_TRACKED_ACCOUNT_RECEIPTS"`, `code: "RECEIPTS_MATCH_EXPECTATIONS"` and `receiptEvidenceVerified: true`. This means the supplied receipt data meets the checks and matches the declared effects. The pure function can produce that result for fabricated fixtures; the online wrapper adds collection from the selected provider, not cryptographic proof.

Reconciled reports always retain `lifecycleVerified: false`, `tradeSemanticsVerified: false`, `walletWideBalanceVerified: false`, `pnlVerified: false` and `sendAuthorized: false`, with `operationMapping: "CALLER_SUPPLIED"`. Offline, input-error and transport-error results verify no receipts and never authorize sending. A rejected report can include individual reconciled receipts for inspection without accepting the package.

Token increases/decreases can be caused by transfers or burns; they do not alone prove buys or sells. The verifier does not decode swap instructions, authenticate CopyPump operation mappings, inspect an application journal/UI, or establish all intervening account activity. A zero balance in one account does not prove wallet-wide zero holdings: a wallet can have [multiple accounts for the same mint](https://solana.com/docs/tokens).

Receipts separately report raw token amounts, owner and fee-payer lamport deltas, and `meta.fee` as `networkFeeLamports`. The [network fee](https://solana.com/docs/core/fees/fee-structure) is not total trading cost. A payer's lamport delta already includes its charged fee; subtracting it again would double-count. Rent, other transfers, tips and [wrapped SOL accounting](https://solana.com/docs/tokens/basics/sync-native) need separate reconciliation. No swap notional, cost basis, realized PnL or real-money profitability is established here.

## Review and public evidence boundary

`npm test` runs deterministic positive/negative fixtures and injected-transport tests without a live RPC endpoint. Internal AI-assisted review and passing tests are not an external Solana runtime audit.

Public issue [#2](https://github.com/CopyPumpApp/CopyPump/issues/2) remains open: the complete BUY → POSITION → PARTIAL SELL → FULL SELL lifecycle still needs real evidence, authenticated application linkage, trade/accounting reconciliation and review. These tools and synthetic examples do not establish that milestone or Mainnet readiness.
