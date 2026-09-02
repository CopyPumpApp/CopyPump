# CopyPump Security Model

> Public-release draft. CopyPump is under active development and is not presented here as production-ready.

## Custody boundary

CopyPump is designed as a non-custodial system:

- the application must not request or store a user's seed phrase or private key;
- wallet authentication is based on proof from the user's wallet rather than custody of wallet secrets;
- transaction signing remains at the supported browser-wallet boundary;
- server-side services must not become a substitute signer for the user wallet.

## Authority model

Automation is intended to operate only inside explicit constraints such as:

- wallet/session scope;
- permitted operation;
- available capital;
- position and exposure limits;
- daily loss / drawdown boundaries;
- token/market restrictions;
- liquidity, slippage and manipulation checks;
- expiration and revocation rules.

A strategy recommendation is not permission to execute outside those constraints.

## AI boundary

AI output is advisory.

AI components may assist with research, classification, diagnostics, explanation and proposal preparation, but they must not:

- sign transactions;
- submit or broadcast transactions on behalf of a wallet;
- grant wallet permissions;
- disable safety controls;
- override a deterministic Risk/Policy rejection.

## Execution safety

A permitted trading flow is expected to cross several independent boundaries:

```text
Signal
  ↓
Qualification
  ↓
Risk / Policy
  ↓
Trade intent
  ↓
Wallet authorization
  ↓
Confirmation
  ↓
Reconciliation + audit evidence
```

The system should fail closed when required evidence, authorization, market data or execution confirmation is unavailable or conflicting.

## Mainnet containment

Production Mainnet execution must remain blocked until the required engineering and verification gates are complete. A green interface, successful build, simulated transaction, test harness result or AI assessment is not sufficient evidence for Mainnet readiness.

## Secrets

The public repository must never contain:

- seed phrases or private keys;
- production API/provider keys;
- session or encryption secrets;
- raw sensitive wallet authorization material;
- raw signed transactions containing sensitive authorization data;
- production user data;
- local runtime vaults or secret stores.

## Vulnerability reporting

Security issues should be reported privately to:

`copypumphq@gmail.com`

Do not publish exploitable details in a public issue before maintainers have had an opportunity to review the report.

## Status

This document describes intended security boundaries. Public release does not imply that all production-readiness work has been completed.
