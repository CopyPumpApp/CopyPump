# Contributing to CopyPump

CopyPump is in active technical alpha on Solana, and **we are looking for developers, testers, researchers, designers, and early users who want to help shape the project**.

You do not need to understand the entire system to contribute. Small, focused contributions are preferred.

## Where help is most useful now

We especially welcome help with:

- Solana Devnet testing and transaction/reconciliation review;
- TypeScript / Node.js engineering;
- React UX and accessibility feedback;
- performance profiling and latency investigation;
- reproducible bug reports;
- security-minded review of public architecture and threat boundaries;
- documentation improvements and examples;
- product feedback from traders and early users;
- public test tooling that can be shared safely.

## Good first contributions

A good first contribution can be as simple as:

1. Read the [public project status](docs/PROJECT_STATUS.md).
2. Pick an open issue labeled `good first issue` or `help wanted` when available.
3. Comment on the issue before starting if the scope is unclear.
4. Keep the change small and focused.
5. Open a pull request with a short explanation of what changed and how you verified it.

### Open implementation tasks

Two scoped tasks are ready for contributors; both work with synthetic public fixtures and require no wallet or private-code access:

| Task | Deliverable |
| --- | --- |
| [#49 — Actual-message inspector](https://github.com/CopyPumpApp/CopyPump/issues/49) | Decode bounded unsigned v1 message bytes and derive canonical message/intent digests for review. |
| [#50 — Explicit account creation/closure evidence](https://github.com/CopyPumpApp/CopyPump/issues/50) | Extend classic-SPL receipt checks only where instruction and account evidence justify creation/closure. |

These are Solana engineering tasks with acceptance and negative-test criteria, not beginner placeholders. They do not enable sending or complete the real Devnet lifecycle milestone.

The previous code-first task, [#39](https://github.com/CopyPumpApp/CopyPump/issues/39), is now completed in [PR #42](https://github.com/CopyPumpApp/CopyPump/pull/42). It added a bounded, read-only Solana Devnet `getTransaction` helper on top of the existing fail-closed classifier. We are intentionally **not manufacturing another beginner issue just to keep the label populated**. New `good first issue` tasks will be opened when they map to a real, public-safe engineering need.

The design/fixture contribution for [#9](https://github.com/CopyPumpApp/CopyPump/issues/9) is implemented as two pure public review modules with synthetic examples and deterministic tests. Experienced Solana transaction/runtime engineers can now challenge executable resource bounds and recovery semantics; see the [review contract](docs/SOLANA_V1_SEND_SAFETY_DRAFT.md) and [run instructions](tools/README.md). External review remains welcome, and no signing or submission path is enabled. Verified real Devnet lifecycle evidence in [#2](https://github.com/CopyPumpApp/CopyPump/issues/2) remains a separate open milestone; [#13](https://github.com/CopyPumpApp/CopyPump/issues/13) is the ongoing contributor invitation.

Issue #2 now includes a [bounded finalized-receipt verifier](docs/DEVNET_LIFECYCLE_VERIFICATION.md). Contributors can review its exact account/amount/fee checks and add focused regressions without a wallet. Real evidence publication still requires reviewed transaction origins, swap interpretation, accounting and application reconciliation; synthetic examples never satisfy that milestone.

If you want to contribute but neither path matches your skills, open an issue titled **`Contributor intro: <your area>`** and briefly describe what you build, test, research, or use. We can then point you to a public-safe slice instead of inventing low-value work.

If you are not ready to write code, useful feedback is still valuable. Reproducible UX, performance, documentation, Devnet, and product observations are welcome.

## Contributor model

Participation in the public CopyPump repository is voluntary and unpaid. Ordinary open-source contributions do not come with a promise of a bounty, tokens, equity, revenue share, employment, or future compensation.

Contributing to the public repository also does not grant access to the private engineering repository, private infrastructure, credentials, wallets, or proprietary core implementation.

## Contribution rules

Please avoid unsolicited large architectural rewrites. For large changes, open an issue first so we can agree on scope and avoid duplicated work.

For code or documentation contributions:

- keep changes narrowly scoped;
- explain the user or engineering problem being solved;
- include tests or verification steps when practical;
- do not weaken deterministic Risk/Policy or wallet-safety boundaries;
- do not claim Mainnet readiness, profitability, or production readiness without evidence;
- keep secrets and private operational material out of commits.

## Licensing of contributions

The public `CopyPumpApp/CopyPump` repository is licensed under the [Apache License 2.0](LICENSE), unless a file explicitly states otherwise.

By intentionally submitting a contribution for inclusion in this public repository, you agree that the contribution may be distributed under Apache-2.0, consistent with Section 5 of that license.

This applies only to material intentionally contributed to the public repository. It does not grant access to, or change the licensing/status of, CopyPump's private engineering repository or proprietary core implementation.

## Bug reports

A useful bug report should include:

- feature or screen involved;
- expected behavior;
- observed behavior;
- exact reproduction steps;
- browser / environment details when relevant;
- timing or performance measurements when relevant;
- screenshots or logs with secrets removed.

Never include seed phrases, private keys, API keys, session secrets, encryption keys, wallet authorization material, or production user data.

## Security issues

Do **not** report exploitable vulnerabilities in public issues or discussions. Follow the private reporting instructions in [`SECURITY.md`](SECURITY.md).

## For early users

If you are evaluating CopyPump as a future user, the most useful feedback today is:

- what you need to trust a non-custodial autonomous trading system;
- which risk controls must be visible before you would use it;
- what information you need before granting bounded trading authority;
- which parts of the current public architecture are unclear;
- what you would expect from a Devnet demo before trying a real product.

Open a focused issue with your feedback. Concrete examples are more useful than generic feature requests.

## Current safety status

CopyPump is still a technical alpha focused on Solana Devnet hardening. Mainnet execution remains intentionally blocked while safety and verification work continue.

## Contact

- GitHub issues: preferred for public product/engineering discussion
- Discord: https://discord.gg/DNBQtqw6R
- X: https://x.com/CopyPumpAI
- Email: **copypumphq@gmail.com**

If you want to contribute but do not know where to start, open an issue titled **`Contributor intro: <your area>`** and briefly describe your skills or what you want to test. You can also join Discord and start in `#questions` or `#devnet-testing`.
