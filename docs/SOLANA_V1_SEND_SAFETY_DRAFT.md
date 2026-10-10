# Solana v1 send-path safety review model

Status: **executable offline review model — no signing or submission authority**

Issue [#9](https://github.com/CopyPumpApp/CopyPump/issues/9) now has two pure reference modules, synthetic examples and deterministic tests. They make the proposed resource and recovery rules reviewable without a wallet, RPC endpoint or access to private engineering code. CopyPump remains in technical alpha / Devnet hardening.

| Module | Scope |
| --- | --- |
| [`validate-send-safety.mjs`](../tools/validate-send-safety.mjs) | Check supplied v1 resource, fee, simulation and recent-blockhash evidence against an explicit test policy. |
| [`classify-submission-recovery.mjs`](../tools/classify-submission-recovery.mjs) | Classify a supplied receipt for a persisted attempt; retain its reservation while the outcome needs reconciliation. |

Both modules always return `sendAuthorized: false`. A `POLICY_CONSISTENT` result is an offline consistency finding, not permission to sign or send. Recovery also always returns `replacementAllowed: false`.

## Protocol facts and product rules

Solana v1 places resource configuration in `message.transactionConfig`:

- Unset `computeUnitLimit` and `loadedAccountsDataSizeLimit` behave as zero. Both must be explicit in this model.
- `priorityFee` is an absolute total in lamports, not a micro-lamport-per-CU price.
- Unset heap size uses the 32 KiB default.
- ComputeBudget instructions are successful no-ops in v1. Rejecting their presence is this model's conservative product rule, not a claim that the protocol rejects them.
- The current documented ceilings are 1,400,000 compute units and 64 MiB of loaded account data. V1 guidance recommends rounding the data limit upward to a 32 KiB page boundary. An unset zero limit does not become a usable 32 KiB limit.

These facts come from the official [v1 upgrade guidance](https://solana.com/upgrades/larger-transaction-sizes), [versioned-transaction documentation](https://solana.com/docs/core/transactions/versioned-transactions), [RPC structures](https://solana.com/docs/rpc/json-structures), [compute-budget documentation](https://solana.com/docs/core/fees/compute-budget), and [fee structure](https://solana.com/docs/core/fees/fee-structure). The constants describe the documented protocol at review time; they do not prove that a particular endpoint supports or has activated a feature.

This initial model admits only v1, the pinned Solana Devnet genesis identity, a recent blockhash, the default heap and zero ComputeBudget instructions. Legacy/v0 input is rejected rather than reinterpreted as v1. There is no runtime feature gate, transaction builder or wallet integration in these modules.

## Input contract and trust boundary

The inputs are **normalized JSON supplied by a trusted adapter**, not raw RPC responses or a Solana SDK transaction object. The adapter is not implemented here.

The adapter must:

1. Decode the actual transaction and verify its version, cluster, programs, instructions, accounts, fee payer, flags and resource configuration. Existing authorization and trading-risk checks remain independently necessary.
2. Compute message digests from canonical actual message content. A copied digest string or `sourceId` label is not evidence by itself.
3. Bind each request and response to the same cluster, policy revision, transaction path and intended message. Preserve the request's commitment, simulation identity, context and observation time.
4. Pair a blockhash and `lastValidBlockHeight` from the same verified `getLatestBlockhash` response, and collect current slot/height observations coherently. A slot must never be substituted for a block height.
5. Preserve full-precision integer fees when decoding and normalizing RPC/SDK values. Precision already lost through a JavaScript `Number` cannot be repaired by converting it to a string.
6. Enforce durable storage, writer ownership and reconciliation in the application. These pure functions do not perform those actions.

`intentDigest` covers all message content other than the two provisional resource limits that estimation is allowed to change: version, fee payer, account order and signer/writable flags, instruction programs/data/order, lifetime, priority fee and effective heap configuration. Both simulations must have the same intent digest. `messageDigest` additionally binds the exact final resource configuration and all final message bytes; the final simulation and fee evidence must match it. The implementation checks these supplied relationships; it does not serialize or hash transactions itself.

All resource-validation evidence uses an explicit `commitment: "confirmed"`: blockhash acquisition, estimation, final simulation, fee estimate and current-chain snapshot. This is a deliberately fixed normalization contract for this review model, not a universal Solana restriction. Missing or mixed commitment values HOLD. Confirmed observations still do not guarantee future execution or finality.

The caller supplies `nowMs`. Simulations and fee evidence must meet the supplied age and slot-lag policy and cannot come from a future time or context. The current-chain snapshot has an age check; lifetime evidence uses commitment, context ordering and remaining block heights rather than its own timestamp or slot-lag limit. Simulations and fee evidence cannot predate the paired blockhash context. Source IDs, timestamps, network labels and digests are checked for consistency, not cryptographically authenticated. Synthetic fixtures do not represent real signatures, blockhash acquisition or chain evidence.

## Resource and fee policy

### Two simulations with different purposes

The first simulation estimates resource consumption with explicit provisional limits. It must produce **both** `unitsConsumed` and `loadedAccountsDataSize` in the same successful result. The final simulation runs the exact final message after limits have been derived. It has a separate simulation identity and cannot precede the estimate.

Both results require `err === null`. An absent `err`, a falsy malformed value, missing measurements or impossible measurements HOLD. Both measurements must be positive safe integers within protocol ceilings, and fit the configuration used by that simulation. The final measurement must also fit the final requested limits.

This follows the official [simulateTransaction contract](https://solana.com/docs/rpc/http/simulatetransaction) and the [v1 resource-estimation guidance](https://solana.com/upgrades/larger-transaction-sizes). A successful simulation is a snapshot, not proof of later execution. If a simulation replaces the recent blockhash, the adapter must propagate that new lifetime and rebuild/revalidate all affected bindings; it cannot silently reuse old evidence.

### Bounded compute headroom

For measured compute `U` and a supplied headroom in basis points `b`:

```text
headroom = ceil(U * b / 10000)
computeUnitLimit = U + headroom
```

The model uses integer arithmetic. Headroom must not exceed `maxComputeHeadroomUnits`; the resulting limit must not exceed either `maxComputeUnitLimit` or the protocol ceiling. Exceeding a bound produces HOLD. The required value is never clamped downward or replaced by a convenient static maximum.

`computeHeadroomBps` is limited to 0–10,000 by this review model, not by Solana. There is no default percentage or production trading policy. The fixture's 10% is test data and has not been validated as a suitable margin for a real transaction path.

### Loaded account data

For measured bytes `D`, supplied path-specific growth allowance `G` and a 32,768-byte page:

```text
loadedAccountsDataSizeLimit = ceil((D + G) / 32768) * 32768
```

Growth is added before page rounding. The result must fit the explicit product-policy ceiling and the 64 MiB protocol ceiling. A result above either ceiling HOLDs rather than being truncated. The adapter's policy must justify `dataGrowthAllowanceBytes` from the accounts a path may create or grow; this model cannot infer future account growth.

Only the default heap is admitted: absent, `null`, or explicitly 32,768 bytes. Larger protocol-permitted heaps need a separately reviewed path and are outside this model.

### Absolute fees with exact integers

The normalized `priorityFee`, `maxPriorityFeeLamports`, `maxTotalFeeLamports` and `totalFeeLamports` are canonical unsigned decimal **strings**, bounded by u64. Numeric values, fractions, exponent notation, leading zeros and overflow are rejected. This preserves amounts above JavaScript's safe-integer limit.

`priorityFee` must fit its absolute cap. Zero requires `allowZeroPriorityFee: true`; the adapter must explicitly normalize an unset RPC fee to `"0"` rather than pass `null`. Ambiguous per-CU fields and SDK aliases are rejected by this normalized schema.

The final message also needs a fresh [getFeeForMessage](https://solana.com/docs/rpc/http/getfeeformessage) estimate within the separate total-network-fee cap. That estimate cannot be below the priority fee. Network fees do not cover trading loss, slippage, token transfer amounts, rent funding or other instruction-level costs; those need separate policy and balance reservations.

Every threshold is supplied by the caller. The examples do not choose CopyPump's production caps.

## Recent-blockhash lifetime

The two simulations must match the recorded blockhash. The current block height must leave at least the supplied `minRemainingBlockHeights` before `lastValidBlockHeight`. Slot freshness alone is insufficient. The model accepts equality only if a test policy explicitly permits zero remaining heights; that boundary test is not a recommended operational margin.

`minContextSlot` is a freshness floor for an RPC operation, not a lease that renews a blockhash. A wallet sheet left open can outlive the blockhash. A future implementation must revalidate before possible handoff and must not silently rebuild a transaction whose earlier attempt has an unknown outcome. See [getLatestBlockhash](https://solana.com/docs/rpc/http/getlatestblockhash), [sendTransaction](https://solana.com/docs/rpc/http/sendtransaction), and [transaction confirmation](https://solana.com/developers/cookbook/transactions/confirmation).

Durable nonces have different lifetime and consumption semantics. Both public models conservatively HOLD that unsupported path. Recent-blockhash expiry rules cannot be applied to a nonce, and a consumed nonce alone is not proof of successful application effects; see [durable nonces](https://solana.com/docs/core/transactions/durable-nonces).

## Recovery after an unknown submission result

A transport timeout does not establish that a transaction was never submitted. A process can also crash after transport handoff but before recording its result. Consequently, both accepted persisted stages, `COMMITTED_BEFORE_SEND` and `SUBMISSION_UNKNOWN`, are treated as potentially submitted.

### Persist before possible handoff

The classifier consumes this minimum recovery projection of a durable attempt:

| Fields | Purpose |
| --- | --- |
| `schemaVersion`, `operationId`, `attemptId` | Identify the operation and its immutable attempt. |
| `signature`, `messageDigest` | Pin reconciliation to the original signed transaction. |
| `network`, `genesisHash` | Prevent cross-cluster interpretation. |
| `policyRevision`, `simulationRevision` | Retain the authorization/evidence revision used for that attempt. |
| `stage` | Record the last durable stage without assuming that a later unrecorded send did not occur. |
| `committedAtSlot`, `minContextSlot` | Retain observed slot floors for subsequent receipts. `committedAtSlot` is the trusted observed floor captured before possible handoff, not a wall-clock timestamp. |
| `expiry` | Persist the original blockhash and `lastValidBlockHeight`, or retain nonce identity for the unsupported nonce path. |
| `lastObservation` | Preserve the last accepted context and status across restart; do not reset terminal evidence. |

This projection is **not a complete application journal**. A real journal must additionally bind the operation to its approved asset/account/amount limits and balance reservation, preserve enough protected transaction material for its supported recovery policy, and enforce one writer and atomic state transitions. A separate durable accounting record must reconcile the actual resulting balances, positions and fees. None of that storage or execution code is implemented in this public model.

The observation is a normalized `getSignatureStatuses` item plus trusted request provenance. Its identity fields are attached by the adapter; they are not returned by that RPC. A receipt or persisted checkpoint below the stored context floors HOLDs. A landed status before `committedAtSlot` is inconsistent and rejected. Contradicting or downgrading previously finalized evidence also HOLDs.

### Recovery decisions

| Observed state | Classifier result | Reservation |
| --- | --- | --- |
| Null receipt, no known expiry | `unknown_not_found` / HOLD | Keep. |
| Null receipt after blockhash expiry | `unknown_expired` / HOLD | Keep. |
| Processed/confirmed receipt, including an error | `pending` / HOLD | Keep until a terminal result is established. |
| Finalized success | `finalized_success` / RECONCILE | Keep until actual effects and fees are reconciled. |
| Finalized failure | `finalized_failure` / RECONCILE | Keep until balances and charged fees are reconciled. |
| Invalid, stale, mismatched or contradictory evidence | HOLD with a bounded reason category | Keep. |
| Durable-nonce attempt | `unsupported_expiry` / HOLD | Keep; use a separately reviewed recovery mechanism. |

**Expiry plus a null status is not proof of non-execution.** Expiry rules out a future valid recent-blockhash execution; it does not rule out an earlier execution. `getSignatureStatuses` normally searches a recent cache, and requesting `searchTransactionHistory: true` still does not turn one provider's null answer into definitive evidence that no effects occurred. Neither case authorizes a replacement or reservation release. See the official [status lookup contract](https://solana.com/docs/rpc/http/getsignaturestatuses) and [confirmation guidance](https://solana.com/developers/cookbook/transactions/confirmation).

A finalized failure is terminal execution evidence, but fees can still have been charged. The model requests reconciliation for success and failure; it never executes a reservation release itself. The [fee documentation](https://solana.com/docs/core/fees/fee-structure) explains that fees are charged even when execution fails.

Rebroadcasting identical signed bytes and constructing a replacement are different operations. This classifier implements neither. A production replacement policy would need independently reviewed idempotency and complete reconciliation of the original attempt, not a timeout-based retry rule.

## Run and review

Run `npm test` from the repository root. The two example invocations are documented in [public contributor tools](../tools/README.md). They use synthetic fixtures and never need a live endpoint.

The tests cover malformed/zero/overflowing limits, page boundaries and growth, bounded headroom, exact fee integers, stale or mismatched simulation/fee/lifetime evidence, changed intent/config/blockhash, explicit commitment, crash ambiguity, expired null receipts, non-finalized errors, contradictory receipts and persisted checkpoint floors.

The initial implementation received a separate internal AI-assisted code review; the resulting consistency findings have regression tests. This is not an external Solana runtime audit. External review remains welcome, particularly for the policy margins, the future trusted adapter, durable persistence and eventual integration into a real transaction path.

## Public task and evidence boundary

- **#9:** the public design/fixture contribution is implemented here and can be reviewed independently. It does not enable v1 sending.
- **[#2](https://github.com/CopyPumpApp/CopyPump/issues/2):** verified BUY → POSITION → PARTIAL SELL → FULL SELL Devnet evidence remains a separate open requirement. Synthetic examples and passing tests cannot satisfy it.
- **[#13](https://github.com/CopyPumpApp/CopyPump/issues/13):** the contributor invitation remains an ongoing invitation, not an implementation acceptance test.

These modules do not classify scam tokens, prove profitability, complete a real trading lifecycle, authorize Mainnet, expose private engineering code or establish production readiness.
