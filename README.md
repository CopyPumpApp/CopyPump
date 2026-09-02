# CopyPump

**Non-custodial autonomous trading on Solana.**

CopyPump is building a trading platform where users retain custody while automation operates inside explicit capital, risk, wallet and policy limits.

> **Status:** technical alpha / Solana Devnet hardening. Not production-ready. Do not use with real funds.

## What CopyPump is trying to solve

Copy trading often forces users to choose between manual monitoring, broad automation permissions or custody of funds by a third party.

CopyPump is being designed around a different model:

**the user keeps custody, defines the limits, authorizes the permitted scope and can audit how trading decisions are produced.**

## Target flow

```text
SMART-MONEY SIGNAL
        ↓
QUALIFICATION
        ↓
RISK / POLICY CHECKS
        ↓
PERMITTED EXECUTION
        ↓
POSITION MANAGEMENT
        ↓
PnL / FEES
        ↓
AUDIT TRAIL
```

Target execution lifecycle:

```text
BUY → POSITION → PARTIAL SELL → FULL SELL
```

## Core principles

- **User custody** — wallet keys remain under the user's control.
- **Constrained authority** — automation is bounded by explicit permissions and risk limits.
- **Deterministic safety** — Risk/Policy checks remain authoritative.
- **Auditability** — important decisions and execution state should be traceable.
- **Factual status** — UI state, simulations and AI output are not presented as proof of production readiness.

## AI boundary

AI can assist with research, classification, diagnostics, explanation and proposal preparation.

AI is not intended to sign transactions, submit transactions, grant wallet permissions or override deterministic safety controls.

## Current development focus

The current engineering phase is focused on proving the non-custodial execution and safety model on Solana Devnet before any production Mainnet deployment.

Public technical materials will be added progressively as they pass a separate release review.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Devnet status](docs/DEVNET_STATUS.md)
- [Roadmap](docs/ROADMAP.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Public channels

- X: https://x.com/copypumpai
- YouTube: https://youtube.com/@copypumpapp
- Pump.fun: https://pump.fun/profile/CopyPumpApp
- Contact: copypumphq@gmail.com

## Source availability

This public repository is intended to be a curated technical surface. The complete private engineering history, operational evidence and internal automation material are not published wholesale.

Selected source code and tests may be added after security, privacy and licensing review.

---

**Independent project. Not affiliated with pump.fun.**