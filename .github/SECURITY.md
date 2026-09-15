# Security Policy

CopyPump is under active development in technical alpha. The public repository is intentionally limited to public-safe contributor tooling, documentation, examples, tests, and selected source slices. The private engineering core is not part of this repository and public contribution does not grant access to private infrastructure, credentials, wallets, or internal systems.

## Reporting a vulnerability

Please do **not** publish exploit details, credentials, wallet material, private keys, seed phrases, API tokens, session secrets, signed secret payloads, or sensitive user/account data in a public issue, pull request, Discussion, commit, or Discord channel.

If GitHub shows a **Report a vulnerability** option for this repository, use that private reporting path. Otherwise, use the official CopyPump Discord (`https://discord.gg/DNBQtqw6R`) only to ask for private maintainer contact; do not post sensitive technical details in a public Discord channel. Wait until a private maintainer channel or direct contact is established before sharing a confidential report.

For non-sensitive security hardening ideas that do not disclose an exploitable weakness, a normal public issue is appropriate.

## What to include

A useful private report should contain:

- the affected public component or documented behavior;
- clear reproduction steps using test data where possible;
- expected versus observed behavior;
- practical impact and preconditions;
- the smallest safe proof of concept needed to demonstrate the issue;
- suggested mitigation, if known.

Do not use real funds, production credentials, another user's wallet/account, or destructive testing to demonstrate a vulnerability.

## Scope and current posture

Public security reports should be evidence-bound to code and behavior that is actually present in the public repository. CopyPump does not claim Mainnet or production readiness unless public evidence explicitly supports that claim. Solana Devnet / technical-alpha boundaries described in the repository remain in force.

The project does not promise a bounty, token allocation, equity, revenue share, employment, or future compensation for vulnerability reports or public security contributions unless a specific offer is explicitly approved in advance.

## Coordinated disclosure

Please allow maintainers a reasonable opportunity to investigate and remediate a confirmed vulnerability before public disclosure. Maintainers may ask for additional reproduction details or propose a disclosure timeline based on severity and fix complexity.

Never request private-repository access, production secrets, wallet keys, seed phrases, or privileged credentials as part of a security report or verification process.
