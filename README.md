# CopyPump

**Follow smart money. Keep control.**

CopyPump is building **non-custodial autonomous trading infrastructure on Solana** where users retain custody while automation operates inside explicit capital, risk, wallet, and policy limits.

> **Status:** technical alpha · Solana Devnet hardening · Mainnet intentionally blocked
>
> Not production-ready. Do not use with real funds.

## At a glance

| | |
| --- | --- |
| **Network** | Solana |
| **Current stage** | Technical alpha / Devnet hardening |
| **Wallet surface** | Phantom-focused |
| **Custody** | User-controlled wallet signing |
| **Automation** | Bounded authority inside explicit limits |
| **Mainnet** | Intentionally blocked |
| **Public repository** | Curated technical surface |

### Quick links

[Project status](docs/PROJECT_STATUS.md) · [Architecture](docs/ARCHITECTURE.md) · [Security model](docs/SECURITY_MODEL.md) · [Devnet status](docs/DEVNET_STATUS.md) · [Roadmap](docs/ROADMAP.md) · [X](https://x.com/CopyPumpAI)

## Why CopyPump

Copy trading often forces users to choose between manual monitoring, broad automation permissions, or custody of funds by a third party.

CopyPump is being designed around a different model:

**the user keeps custody, defines the limits, authorizes the permitted scope, and can audit how trading decisions are produced.**

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
- **Bounded authority** — automation is constrained by explicit permissions and risk limits.
- **Deterministic safety** — Risk/Policy checks remain authoritative.
- **Auditability** — important decisions and execution state should be traceable.
- **Factual status** — UI state, simulations, and AI output are not presented as proof of production readiness.

## AI boundary

AI can assist with research, classification, diagnostics, explanation, and proposal preparation.

AI is not intended to sign transactions, submit transactions, grant wallet permissions, or override deterministic safety controls.

## Current development focus

The current engineering phase is focused on proving the non-custodial execution and safety model on Solana Devnet before any production Mainnet deployment.

The next major public proof target is a reviewed real-Devnet lifecycle with transaction confirmation, reconciliation, PnL/fee accounting, and audit evidence. Simulated or paper execution is not presented as equivalent proof.

See [Public Project Status](docs/PROJECT_STATUS.md) for the current evidence boundary and next public milestones.

## What to watch

This repository is the public technical surface for CopyPump. As milestones clear review, it will receive:

- factual Devnet progress and evidence;
- selected source code and tests that are safe to publish;
- architecture and security updates;
- roadmap changes tied to verified engineering progress;
- release notes for meaningful public milestones.

If you're following the build, **star or watch this repository** to keep track of public milestones.

## Documentation

- [Public project status](docs/PROJECT_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Devnet status](docs/DEVNET_STATUS.md)
- [Roadmap](docs/ROADMAP.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)

## Public channels

- **X:** https://x.com/CopyPumpAI
- **YouTube:** https://youtube.com/@copypumpapp
- **Pump.fun:** https://pump.fun/profile/CopyPumpApp
- **Contact:** copypumphq@gmail.com

## Source availability

This repository is a curated public technical surface. The complete private engineering history, operational evidence, and internal automation material are not published wholesale.

Selected source code and tests may be added after security, privacy, and licensing review. The separation exists to protect unfinished execution paths and sensitive engineering material, not to replace factual evidence.

---

**Independent project. Not affiliated with pump.fun.**
