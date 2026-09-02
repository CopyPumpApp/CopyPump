# Security Policy

CopyPump is currently in technical alpha and is being hardened on Solana Devnet. It is not production-ready and should not be used with real funds.

## Reporting a security issue

Please report suspected vulnerabilities privately to:

**copypumphq@gmail.com**

Do not open a public GitHub issue for vulnerabilities that could expose users, funds, credentials, signing flows, wallet permissions, or infrastructure.

When reporting, include only the minimum information needed to reproduce the issue. If possible, include:

- affected component or flow;
- expected behavior;
- observed behavior;
- reproduction steps;
- relevant logs with secrets removed;
- impact assessment.

## Never send secrets

Do not send or commit:

- seed phrases or private wallet keys;
- API keys or provider secrets;
- session secrets or encryption master keys;
- raw signed transactions containing sensitive material;
- production user data.

If a credential may have been exposed, rotate or revoke it before sending a report.

## Scope

Security reports related to CopyPump wallet authorization, execution, risk controls, transaction handling, session/delegated authority, reconciliation, API boundaries, and secret handling are especially important.

Because the project is under active development, behavior and scope may change before production release.

---

**Independent project. Not affiliated with pump.fun.**
