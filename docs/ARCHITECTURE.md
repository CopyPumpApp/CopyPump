# CopyPump Architecture

> Public-release draft. This document describes the intended high-level architecture without exposing private operational details.

CopyPump is being designed as a non-custodial trading system on Solana. The user retains wallet custody while the application evaluates on-chain activity and prepares trading actions inside explicit policy and risk boundaries.

## High-level flow

```text
On-chain observations
        ↓
Signal qualification
        ↓
Risk + policy checks
        ↓
Permitted trade intent
        ↓
Wallet/session authorization
        ↓
Execution + confirmation
        ↓
Position reconciliation
        ↓
PnL / fees / audit evidence
```

## Product layers

### 1. User interface

The frontend presents wallet state, strategy controls, market/smart-money observations, positions and execution status. Russian and English product localization are part of the active product work.

### 2. Application backend

The backend owns authoritative application contracts and coordinates:

- runtime state;
- signal qualification;
- deterministic policy and risk checks;
- execution preparation;
- confirmation and reconciliation;
- audit/event recording;
- provider health and degraded-state reporting.

### 3. Wallet boundary

CopyPump is designed so the application does not hold a user's seed phrase or private key. Authentication and transaction authorization are performed through the supported browser-wallet flow.

The wallet boundary is intentionally separate from analytical and AI components.

### 4. Trading intelligence

The system contains deterministic and analytical components for areas such as:

- smart-money discovery;
- wallet and transaction analysis;
- opportunity qualification;
- fraud/manipulation signals;
- risk evaluation;
- trade preparation;
- position lifecycle and reconciliation.

### 5. AI / agent layer

AI can assist with research, classification, diagnostics, explanation and proposal preparation.

AI is not intended to have signing authority, transaction-submission authority, wallet-permission authority, or the ability to bypass deterministic Risk/Policy controls.

### 6. Solana execution boundary

The intended execution lifecycle is:

```text
BUY → POSITION → PARTIAL SELL → FULL SELL
```

Transaction confirmation and balance/position reconciliation are treated as part of execution correctness rather than optional UI feedback.

## Runtime separation

Development and verification modes are kept separate from production Mainnet behavior. A successful UI state, build, simulation or AI response is not by itself treated as proof that financial execution is safe or production-ready.

## Security principles

CopyPump's architecture is organized around four public principles:

1. **User custody** — users retain control of wallet keys.
2. **Constrained authority** — automation is bounded by explicit permissions and limits.
3. **Deterministic safety** — Risk/Policy checks remain authoritative.
4. **Auditability** — important execution decisions and state changes should be traceable.

## Current status

CopyPump remains under active technical hardening. This architecture document describes the product direction and boundaries; it does not assert Mainnet production readiness.
