# CopyPump — Public Project Status

Last updated: 2026-09-05

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

1. Publish reviewed evidence for a complete real Devnet execution lifecycle when that evidence is ready.
2. Publish selected source code and tests that pass security, privacy, and licensing review.
3. Tie future roadmap updates to reproducible engineering evidence rather than marketing claims.
4. Publish release notes for meaningful public milestones instead of creating cosmetic releases.

## Why the full engineering repository is not public

CopyPump keeps the active engineering repository private while the product is being hardened. The public repository is a curated technical surface. This reduces the risk of exposing operational material, secrets, unsafe unfinished execution paths, or internal security details solely for visibility.

That separation does not change the evidence standard: public claims should remain factual, bounded, and reviewable.

---

Follow progress through the [main README](../README.md), [Devnet status](DEVNET_STATUS.md), and [roadmap](ROADMAP.md).
