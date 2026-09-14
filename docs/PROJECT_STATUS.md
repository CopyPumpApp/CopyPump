# CopyPump — Public Project Status

Last updated: 2026-09-14

CopyPump is under active development. This page is intentionally conservative: it separates what is publicly documented from what is still being verified privately.

## Current stage

| Area | Public status |
| --- | --- |
| Network | Solana |
| Product stage | Technical alpha |
| Current verification target | Solana Devnet |
| Wallet model | User-controlled wallet signing; Phantom-focused surface |
| Custody model | Non-custodial design |
| Automation model | Bounded / constrained authority |
| Mainnet | Intentionally blocked |
| Public source | Curated documentation; selected source/tests only after review |

## Current engineering milestone

The current milestone is to verify the complete trading lifecycle on Solana Devnet with factual evidence:

```text
SMART-MONEY SIGNAL
        ↓
QUALIFICATION
        ↓
RISK / POLICY CHECKS
        ↓
BUY → POSITION → PARTIAL SELL → FULL SELL
        ↓
CONFIRMATION / RECONCILIATION
        ↓
PnL / FEES / AUDIT EVIDENCE
```

A lifecycle is not considered publicly proven merely because a UI, build, simulation, paper executor, or AI assessment succeeds. Public proof requires the relevant Devnet transaction and reconciliation evidence to be captured and reviewed.

## Current development review — September 14, 2026

Product hardening remains in progress. The latest working-state review found useful engineering progress in the Price Alerts slice, but the slice is still **IN PROGRESS / NOT PASS** and is not a standalone product milestone.

The main diagnostic advance is that the remaining Save latency has been narrowed to application-state queue contention rather than a simple stale-process problem. A clean runtime restart did not remove the delay: initial fresh-runtime Save cycles still measured roughly **11.6–12.4 seconds**. Queue profiling showed that Price Alerts updates can wait several seconds before their updater starts, with observed waits around **5.2 seconds** and **6.6 seconds** while background state writes are ahead in the same queue.

The writes observed ahead of the user-facing update include background agent-state persistence and periodic market/whale state updates. Durable persistence itself is variable and still contributes some latency, but the queue wait before the Price Alerts updater begins is currently the larger user-visible bottleneck.

This is a diagnostic milestone, not a feature-completion claim. The next acceptance step is to reduce or isolate unnecessary StateStore queue pressure, rerun the Price Alerts Save path, and then satisfy the normal CopyPump acceptance contract before marking the slice PASS.

The primary proof target remains unchanged: a complete reviewed Solana Devnet trading lifecycle with transaction confirmation, reconciliation, fee/PnL accounting, and audit evidence.

Public milestone updates remain gated by a strict evidence policy: a material update must be verified, safe to disclose, supported by repository evidence, and must not imply Mainnet readiness, profitability, completed external audit, funding, or production readiness without separate verified evidence.

Mainnet remains intentionally blocked while hardening and verification continue.

## Publicly available today

- product and architecture overview;
- security and custody model;
- conservative Devnet status;
- public roadmap;
- security and contribution policies;
- project channels and contact information.

## Not claimed today

CopyPump does **not** currently claim:

- production Mainnet readiness;
- permissionless public access to the full private engineering repository;
- verified profitability or guaranteed trading performance;
- that simulations or paper execution equal real on-chain execution;
- that AI can bypass deterministic safety controls or sign transactions.

## Next public milestones

1. Bring the current Price Alerts slice to PASS under the normal verification contract.
2. Publish reviewed evidence for a complete real Devnet execution lifecycle when that evidence is ready.
3. Publish selected source code and tests that pass security, privacy, and licensing review.
4. Tie future roadmap updates to reproducible engineering evidence rather than marketing claims.
5. Publish release notes for meaningful public milestones instead of creating cosmetic releases.

## Why the full engineering repository is not public

CopyPump keeps the active engineering repository private while the product is being hardened. The public repository is a curated technical surface. This reduces the risk of exposing operational material, secrets, unsafe unfinished execution paths, or internal security details solely for visibility.

That separation does not change the evidence standard: public claims should remain factual, bounded, and reviewable.

---

Follow progress through the [main README](../README.md), [Devnet status](DEVNET_STATUS.md), and [roadmap](ROADMAP.md).
