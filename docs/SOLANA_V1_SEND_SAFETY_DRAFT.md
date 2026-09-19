# Solana v1 send-path safety draft

Status: **public review draft — not an implementation, not a readiness claim**

This note narrows issue #9 into a concrete proposal that an external Solana/runtime reviewer can challenge. CopyPump remains in technical-alpha / Devnet hardening. This document does **not** enable v1 transaction construction, signing, submission, or Mainnet operation.

## Why this needs an explicit policy

Solana v1 moves transaction resource configuration into `message.transactionConfig`. For v1, ComputeBudget instructions do not configure these limits. In particular:

- `computeUnitLimit` must be explicit; an unset v1 limit behaves as zero;
- `loadedAccountsDataSizeLimit` must be explicit; an unset v1 limit behaves as zero;
- `priorityFee` is an absolute total in lamports, not a micro-lamport-per-CU price;
- `heapSize` defaults to 32 KiB when unset;
- clients reading v1 transactions must opt in with `maxSupportedTransactionVersion: 1`.

Official references:

- https://solana.com/upgrades/larger-transaction-sizes
- https://solana.com/docs/rpc/json-structures
- https://solana.com/docs/core/fees/compute-budget
- https://solana.com/docs/core/fees/fee-structure

## Proposed fail-closed invariants for review

The rules below are intentionally conservative. Values described as **product policy** are not chosen here; an external review should help determine the safest shape before implementation.

### 1. Version and mode gate

A future v1 send path should reject unless all of the following are true:

- the transaction is explicitly being built as v1;
- the runtime path is intentionally enabled for the current environment;
- the cluster is the expected non-Mainnet cluster for CopyPump's current hardening phase;
- the calling path has explicit simulation evidence for the same logical transaction.

There should be no implicit fallback from an unsupported/invalid v1 configuration into a send attempt.

### 2. Compute-unit limit

Proposed checks:

- reject missing, `null`, zero, negative, non-integer, or non-finite values;
- reject values above Solana's transaction compute ceiling (currently 1,400,000 CUs in the official compute-budget documentation);
- derive the requested limit from simulation evidence rather than a broad static maximum;
- require explicit bounded headroom policy rather than silently inflating to the protocol maximum.

Review question: what headroom rule is conservative enough for trading transactions without turning the limit into an effectively unbounded request?

### 3. Loaded-account-data-size limit

Proposed checks:

- reject missing, `null`, zero, negative, non-integer, or non-finite values;
- derive from the simulation result's loaded account data size;
- round upward to a 32 KiB page boundary as recommended by the Solana v1 upgrade guidance;
- include an explicit policy for accounts that may be created or grow between simulation and execution;
- apply a CopyPump product-policy ceiling rather than accepting any protocol-permitted value automatically.

Review question: what headroom rule best handles account creation/growth while remaining fail-closed?

### 4. Heap policy

Proposed default:

- leave `heapSize` unset so the runtime default remains in effect unless a specific transaction path has evidence that a larger frame is required;
- if an override is ever permitted, treat it as a separately bounded allowlisted path rather than a generic user-controlled value.

Review question: should CopyPump forbid heap overrides entirely until a concrete instruction path demonstrates a need?

### 5. Priority-fee policy

For v1, `priorityFee` is the **total lamport amount**. A future policy should therefore:

- treat legacy/v0 per-CU fee logic as incompatible with v1;
- permit no priority fee only when policy explicitly allows zero;
- reject negative, non-integer, malformed, or otherwise invalid values;
- apply a hard absolute-lamport product-policy cap before any signing boundary;
- require the UI/API to display the actual absolute lamport total being requested, not a legacy per-CU price.

This draft intentionally does **not** choose the CopyPump lamport cap. That needs a separate product/risk decision supported by current fee conditions and testing.

### 6. Simulation must precede signing

A future v1 path should not proceed to a signing boundary unless simulation for the same logical transaction confirms, at minimum:

- simulation success (`err == null`);
- `unitsConsumed` is present and compatible with the proposed compute limit plus explicit headroom;
- `loadedAccountsDataSize` is present and compatible with the proposed data-size limit plus explicit headroom;
- no unexpected account/program set change is introduced by the builder between simulation and signing;
- all normal CopyPump transaction allowlists/risk checks still pass independently of v1 resource checks.

A successful simulation is necessary evidence, not proof that a later submission will land.

### 7. No blind retry after an unknown submission result

Timeout or transport failure after submission must not be interpreted as "not submitted." Proposed state model:

`prepared -> simulated -> signed -> submitted-unknown | confirmed | failed`

For `submitted-unknown`:

- persist/recover the transaction signature or deterministic submission identity before any retry decision;
- reconcile via read-only status/transaction lookup;
- do not create or sign a replacement transaction solely because the submit call timed out;
- require an explicit idempotency/reconciliation rule before any resubmission is allowed.

Review question: what minimum persisted state is required to make restart/reconciliation safe across process failure?

## Deterministic negative fixtures requested

A useful external PR can add pure fixtures/tests for policy validation without signing or network I/O. Suggested reject cases:

1. v1 config missing `computeUnitLimit`;
2. `computeUnitLimit: 0`;
3. compute limit above protocol ceiling;
4. missing `loadedAccountsDataSizeLimit`;
5. loaded-account-data limit of zero;
6. priority fee above a supplied test policy cap;
7. legacy/v0 per-CU fee field accidentally reused as a v1 absolute fee;
8. heap override when the path does not allow one;
9. simulation error;
10. missing simulation measurements;
11. measured resource use above the proposed bounded request;
12. `submitted-unknown` state followed by a blind retry attempt.

The tests should accept a supplied policy object so fixtures do not hard-code a production CopyPump fee cap or Mainnet policy.

## What an external reviewer can contribute

A strong review can be small. Any one of these is useful:

- identify a technically incorrect invariant in this draft;
- propose a safer headroom rule for compute or loaded-account data;
- propose the minimum idempotency/reconciliation state for submitted-unknown transactions;
- add deterministic policy-validation fixtures/tests;
- identify a v1-specific failure mode that this draft misses.

Please keep feedback public-safe: no private keys, credentials, private repository material, real funds, or sensitive exploit details.

## Explicit non-claims

This draft does not show that CopyPump can safely send v1 transactions, does not enable Mainnet, does not prove end-to-end lifecycle readiness, and is not a standalone product milestone. It is a public review surface intended to make expert feedback easier and more concrete.
