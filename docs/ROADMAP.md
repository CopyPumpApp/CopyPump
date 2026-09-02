# CopyPump Roadmap

This roadmap describes direction, not guaranteed dates, returns, fundraising outcomes or investment promises.

## Phase 1 — Devnet execution truth

Goal: prove the complete non-custodial lifecycle on Solana Devnet with factual evidence.

Focus:

- Phantom wallet flow;
- explicit strategy and risk configuration;
- qualified smart-money signal handling;
- permitted BUY execution;
- position creation;
- PARTIAL SELL;
- FULL SELL;
- transaction confirmation and reconciliation;
- PnL / fee accounting;
- auditable execution evidence;
- failure and restart behavior.

## Phase 2 — Safety hardening

Goal: close the engineering conditions required before any Mainnet-readiness proposal.

Focus:

- durable idempotency and execution lifecycle state;
- fail-closed recovery behavior;
- stronger confirmation and evidence requirements;
- global emergency-stop hierarchy;
- tightly controlled production capital limits;
- permission/session durability and replay protection;
- multi-process ownership and recovery guarantees;
- operational backup, restore and corruption testing.

## Phase 3 — Public technical surface

Goal: make CopyPump understandable and reviewable without exposing private operational material.

Current work includes:

- maintaining this clean public GitHub repository;
- public architecture and security documentation;
- selected reviewed tests and source modules;
- reproducible public verification instructions;
- product demos and public media;
- issue and vulnerability-reporting processes.

## Phase 4 — Limited production preparation

Goal: evaluate whether the project has sufficient evidence to propose carefully bounded Mainnet operation.

This phase starts only after the required safety gates are closed. It does **not** begin merely because the UI, build, Devnet flow or fundraising milestone succeeds.

Potential work includes:

- deployment-controlled limits;
- staged rollout controls;
- observability and incident response;
- production provider redundancy;
- security review;
- narrowly scoped user testing.

## Long-term direction

CopyPump aims to make autonomous trading more transparent and constrained: users keep custody, define limits and can inspect how signals become trading decisions.

Roadmap items may change as engineering evidence, security findings, ecosystem conditions and user feedback evolve.
