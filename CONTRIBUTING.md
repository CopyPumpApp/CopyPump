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

For a code-first starting point, see [#16: optional Solana Devnet RPC verification for the public evidence validator](https://github.com/CopyPumpApp/CopyPump/issues/16).

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
