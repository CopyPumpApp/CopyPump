# CopyPump Devnet Status

> **Current public status:** technical alpha / Solana Devnet hardening.

CopyPump is validating its execution and safety model before any production Mainnet deployment. The project should not be treated as ready for real-funds trading.

## What is currently supported by engineering evidence

The inspected engineering work supports active implementation and validation of boundaries around:

- wallet authentication and wallet-controlled signing;
- deterministic Risk/Policy checks;
- explicit execution preparation and confirmation flows;
- smart-money signal qualification;
- position lifecycle handling;
- transaction confirmation and reconciliation;
- PnL and fee accounting;
- audit evidence;
- failure containment;
- Devnet/testnet verification.

## End-to-end Devnet proof

CopyPump's target execution lifecycle is:

```text
BUY → POSITION → PARTIAL SELL → FULL SELL
```

A complete real Devnet lifecycle should be considered publicly verified only when the corresponding transaction signatures, confirmation/reconciliation results and accounting evidence have been captured and reviewed. Simulated or paper execution is not presented as equivalent evidence.

## Mainnet status

**Not ready / intentionally blocked.**

Production Mainnet execution remains outside the current public readiness claim. Mainnet should remain blocked until the required safety work is complete and independently reverified.

## Evidence standard

CopyPump distinguishes between:

- code/build success;
- runtime correctness;
- browser/wallet verification;
- real Devnet execution evidence;
- production Mainnet readiness.

These are separate gates. A passing build, attractive UI, simulation or AI assessment is not by itself proof of financial readiness.
