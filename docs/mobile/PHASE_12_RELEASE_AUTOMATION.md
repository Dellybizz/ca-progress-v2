# Mobile Phase 12 — Unified updates and controlled release

Phase 12 completes the automatic hosted-update boundary and creates a fail-closed native release path.

## Complete

- Release contract schema 2 with release sequence, hosted web update mode, per-platform minimum/recommended builds, rollout channel and rollback capability.
- Native launch/resume compatibility checks with a non-blocking recommended update and non-dismissible minimum-version gate.
- Hourly, idempotent account-deletion scan/process jobs. They revoke authentication, delete private D1/R2 study data, pseudonymize the stable application owner and retain bounded payment/tax/fraud/audit evidence plus a non-PII receipt.
- Branded CA Progress app icons and launch images replace Capacitor defaults.
- Manual protected GitHub workflow builds signed Android AAB and signed iOS archive artifacts only when every required signing secret exists.
- Exact Android/iOS device matrix, promotion gates, staged rollout and non-destructive rollback runbook.
- Mobile branch is included in V2 CI and the authorized Cloudflare deployment workflow. `main` remains unchanged.

## Automatic update boundary

Website UI, APIs and shared hosted features deploy once to Cloudflare and appear in the website, PWA and installed native shells. Native plugins, permissions, identifiers, signing, billing or native code require a higher signed store build and review. Phase 12 does not bypass Apple or Google review.

## External release inputs

Store accounts, agreements, signing material, Apple Team ID, Play signing fingerprint, reviewer credentials, approved listings/screenshots and final TestFlight/Play Console promotion are not repository facts and cannot be invented. The release workflow fails closed until they are supplied through protected GitHub environments.
