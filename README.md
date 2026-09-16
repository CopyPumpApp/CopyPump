# CopyPump

[![Public CI](https://github.com/CopyPumpApp/CopyPump/actions/workflows/ci.yml/badge.svg)](https://github.com/CopyPumpApp/CopyPump/actions/workflows/ci.yml)

**Follow smart money. Keep control.**

CopyPump is building **non-custodial autonomous trading infrastructure on Solana** where users retain custody while automation operates inside explicit capital, risk, wallet, and policy limits.

> **Status:** technical alpha · Solana Devnet hardening · Mainnet intentionally blocked
>
> Not production-ready. Do not use with real funds.

## Join the build

CopyPump is actively looking for **Solana developers, TypeScript/Node.js engineers, React contributors, testers, security-minded reviewers, and early users**.

You can help without touching the full private engineering stack. The public repository is where we are building a useful collaboration surface for:

- focused public issues;
- reproducible Devnet and performance findings;
- selected source/test packages that are safe to publish;
- architecture and security review;
- UX/accessibility feedback;
- early-user product feedback.

**Start here:** [Contributing](CONTRIBUTING.md) · [Open issues](https://github.com/CopyPumpApp/CopyPump/issues) · [Discord](https://discord.gg/DNBQtqw6R) · [Project status](docs/PROJECT_STATUS.md)

### Run something in 60 seconds

The repository includes a small zero-dependency public tool rather than documentation only. It validates the structure and safety boundary of a proposed Solana Devnet lifecycle evidence manifest. By default it stays fully offline; contributors can also opt into a bounded `getGenesisHash` check that confirms an RPC endpoint is Solana Devnet without signing, submitting, or looking up transactions.

```bash
git clone https://github.com/CopyPumpApp/CopyPump.git
cd CopyPump
npm test
node tools/validate-devnet-evidence.mjs examples/devnet-evidence.example.json
```

Optional Devnet RPC identity check:

```bash
node tools/validate-devnet-evidence.mjs examples/devnet-evidence.example.json \
  --rpc-url https://api.devnet.solana.com
```

See [public contributor tools](tools/README.md). The validator does **not** prove that a transaction exists on-chain or claim that CopyPump's lifecycle is complete; it gives contributors a runnable base for building independent Devnet verification tooling.

### Active contributor queue

We are intentionally keeping the active queue small so contributors can see the highest-value work immediately instead of being spread across low-signal tasks.

- **Primary code-first microtask — Solana / Node.js:** [#31 Add a fail-closed Solana v1 transaction-read helper](https://github.com/CopyPumpApp/CopyPump/issues/31) — `good first issue` · `help wanted`. The first external PR is now intentionally tiny: add a **pure, zero-network classifier** for decoded `getTransaction` JSON-RPC responses plus deterministic tests for transaction returned, `result: null`, RPC `-32015`, failed transaction (`meta.err`), and malformed response. Legacy/v0/v1-shaped transaction objects must remain version-tolerant; transport/RPC plumbing is deferred to a later task.
- **High-value expert review — Solana transaction safety:** [#9 Review safe Solana v1 send-path resource bounds](https://github.com/CopyPumpApp/CopyPump/issues/9) — `help wanted`. The task is not to enable v1 sending. It asks for a fail-closed public safety contract around explicit `transactionConfig` resource limits, absolute-lamport priority-fee caps, simulation invariants, deterministic v0/v1 negative fixtures, and submitted-unknown/idempotency/reconciliation behavior. This review is Devnet-hardening work and is not a CopyPump Mainnet- or v1-send-readiness claim.

Broader docs-only, UX-only, checklist-only, and private-runtime benchmark tasks are paused until there is a concrete public slice that makes them directly testable.

If you want to help but are unsure where to start, open an issue titled `Contributor intro: <your area>` and tell us what you build, test, research, or use. You can also join the [CopyPump Discord](https://discord.gg/DNBQtqw6R) and start in `#questions`, `#devnet-testing`, `#bug-reports`, or `#feature-ideas`.

## At a glance

| | |
| --- | --- |
| **Network** | Solana |
| **Current stage** | Technical alpha / Devnet hardening |
| **Wallet surface** | Phantom-focused |
| **Custody** | User-controlled wallet signing |
| **Automation** | Bounded authority inside explicit limits |
| **Mainnet** | Intentionally blocked |
| **Public repository** | Curated technical + collaboration surface |

### Quick links

[Project status](docs/PROJECT_STATUS.md) · [Architecture](docs/ARCHITECTURE.md) · [Security model](docs/SECURITY_MODEL.md) · [Devnet status](docs/DEVNET_STATUS.md) · [Roadmap](docs/ROADMAP.md) · [Contributing](CONTRIBUTING.md) · [Maintainers](MAINTAINERS.md) · [Discord](https://discord.gg/DNBQtqw6R) · [X](https://x.com/CopyPumpAI)

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

This repository is the public technical and collaboration surface for CopyPump. As milestones clear review, it will receive:

- factual Devnet progress and evidence;
- selected source code and tests that are safe to publish;
- architecture and security updates;
- roadmap changes tied to verified engineering progress;
- contributor-friendly issues and public tasks;
- release notes for meaningful public milestones.

If you're following the build, **star or watch this repository**. If you can contribute, check the open issues and `CONTRIBUTING.md`.

## Documentation

- [Public project status](docs/PROJECT_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Devnet status](docs/DEVNET_STATUS.md)
- [Roadmap](docs/ROADMAP.md)
- [Public contributor tools](tools/README.md)
- [Security policy](SECURITY.md)
- [Contributing](CONTRIBUTING.md)
- [Maintainers and ownership](MAINTAINERS.md)

## Public channels

- **Discord:** https://discord.gg/DNBQtqw6R
- **X:** https://x.com/CopyPumpAI
- **YouTube:** https://youtube.com/@copypumpapp
- **Pump.fun:** https://pump.fun/profile/CopyPumpApp
- **Contact:** copypumphq@gmail.com

Never share seed phrases, private keys, passwords, 2FA codes, wallet backup phrases, or signed secret payloads with anyone claiming to be support.

## License and source boundary

The contents of this **public repository** are licensed under the [Apache License 2.0](LICENSE), unless a file explicitly states otherwise. Contributions intentionally submitted to this repository are accepted under the same license terms.

This license applies only to material actually published in `CopyPumpApp/CopyPump`. It does **not** make CopyPump's private engineering repository, proprietary core trading implementation, private operational evidence, credentials, or unreleased internal systems public or open source.

The complete private engineering history and proprietary core remain separate and closed. Public code is selected deliberately so contributors can build, test, and review useful components without exposing sensitive or unreleased implementation.

---

**Independent project. Not affiliated with pump.fun.**
