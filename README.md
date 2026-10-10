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

The repository includes small zero-dependency public tools rather than documentation only. The Devnet evidence validator checks the structure and safety boundary of a proposed Solana Devnet lifecycle evidence manifest. By default it stays fully offline; contributors can also opt into a bounded `getGenesisHash` check that confirms an RPC endpoint is Solana Devnet without signing or submitting transactions.

The public code also includes a pure, fail-closed `getTransaction` response classifier with deterministic legacy/v0/v1 fixtures plus a bounded, read-only Devnet transaction helper. The helper remains offline unless both an RPC URL and transaction signature are supplied, verifies the endpoint is Devnet first, then calls `getTransaction` with `maxSupportedTransactionVersion: 1`. It does not connect a wallet, sign or submit transactions, enable Mainnet, or expose private code.

Two additional offline review modules check supplied v1 resource/fee/simulation evidence and classify recovery after an unknown submission result. They include synthetic examples and regression tests for issue #9. Every outcome keeps `sendAuthorized: false`; these are public consistency models, not an enabled trading path. See the [review contract](docs/SOLANA_V1_SEND_SAFETY_DRAFT.md).

For the real Devnet evidence milestone, a new bounded reader can compare three finalized transaction receipts against an expected token-account lifecycle, native balance changes and network fees. Its pure reconciler checks signatures, account identities, exact amounts and chronological continuity. It reports the limited receipt scope explicitly; swap interpretation, operation-record authenticity, full-wallet holdings and PnL still need separate evidence. See [Devnet lifecycle verification](docs/DEVNET_LIFECYCLE_VERIFICATION.md).

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

See [public contributor tools](tools/README.md). These tools do **not** prove that CopyPump's trading lifecycle is complete or certify production readiness; they provide a public base for verification and review work.

### Active contributor queue

We are intentionally keeping the active queue small instead of manufacturing issues purely to create activity.

- **Implemented review surface — Solana transaction safety:** [#9](https://github.com/CopyPumpApp/CopyPump/issues/9) now has pure resource-policy and unknown-submission recovery models, synthetic examples and deterministic tests. External runtime review is still welcome. The [contract](docs/SOLANA_V1_SEND_SAFETY_DRAFT.md) explains the policy, trusted-adapter boundary and remaining integration work; no v1 send path is enabled.
- **Open evidence milestone:** [#2](https://github.com/CopyPumpApp/CopyPump/issues/2) now has a [bounded receipt verifier and runbook](docs/DEVNET_LIFECYCLE_VERIFICATION.md). It still requires reviewed real Devnet lifecycle evidence; passing synthetic tests or matching a declared token-account pattern does not complete the milestone.
- **Ongoing contributor invitation:** [#13](https://github.com/CopyPumpApp/CopyPump/issues/13) remains available for people interested in helping with public work.

The previous code-first task [#39](https://github.com/CopyPumpApp/CopyPump/issues/39) is complete in [PR #42](https://github.com/CopyPumpApp/CopyPump/pull/42). We are not immediately opening another `good first issue` just to keep the label populated. The next beginner task will be created when it maps to a real public-safe engineering need.

If you want to help but #9 does not match your skills, open an issue titled `Contributor intro: <your area>` and tell us what you build, test, research, or use. That lets the maintainer map you to a useful public-safe slice instead of inventing low-value work. You can also join the [CopyPump Discord](https://discord.gg/DNBQtqw6R) and start in `#questions`, `#devnet-testing`, `#bug-reports`, or `#feature-ideas`.

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

## Support CopyPump Open Tools

CopyPump Open Tools is available on Giveth for voluntary community support.

Donations help fund public Solana verification tooling, deterministic tests, developer documentation, and other open technical work published for community use and review.

Donations are not investments and do not provide tokens, equity, financial returns, or access to future products.

[Support CopyPump Open Tools on Giveth](https://giveth.io/project/copypump-open-tools)

## Documentation

- [Public project status](docs/PROJECT_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY_MODEL.md)
- [Devnet status](docs/DEVNET_STATUS.md)
- [Roadmap](docs/ROADMAP.md)
- [Public contributor tools](tools/README.md)
- [Devnet lifecycle verification](docs/DEVNET_LIFECYCLE_VERIFICATION.md)
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
