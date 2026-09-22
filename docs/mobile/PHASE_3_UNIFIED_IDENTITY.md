# Mobile Phase 3 — Unified Authentication and Identity

Baseline: Mobile Phase 2 tree based on production commit `471ade75da025df51fcf98ba6740f400e10b9cae`.

## Implemented

- Retained one permanent `app_users.user_id` ownership key across website and mobile.
- Retained Google and LinkedIn OIDC with signed, expiring transaction state and PKCE.
- Linked a new provider to an existing account only when exactly one verified-email identity matches; ambiguous legacy identities fail closed for review.
- Retained opaque random session tokens in secure HTTP-only SameSite cookies while D1 stores only their SHA-256 hashes.
- Added web/mobile client classification, active-device listing and append-only session security events.
- Added rolling session rotation before idle expiry without extending the absolute expiry boundary.
- Added current-device, other-device and all-device revocation controls.
- Added a fixed `ca-progress://auth/complete` mobile OAuth return that contains navigation state but never a credential.
- Added a versioned `/api/v1/session` endpoint and Settings security/device controls.
- Retained server-side role, entitlement, ownership and account-state resolution.
- Retained the existing idempotent guest migration ledger, receipt verification and account-isolated IndexedDB cleanup. Conflicts remain on-device for review and are never silently overwritten.

## Security boundaries

- OAuth tokens are used only server-side for the provider exchange and are not stored in the browser.
- The mobile deep link contains no session token, OAuth token, user ID or entitlement data.
- A verified email links providers only when the match is unique. Unverified email is never an account-linking authority.
- Session rotation preserves the original absolute expiry.
- Session events are append-only and device controls require same-origin mutation checks.
- Native secure-storage integration remains Phase 11 because no native container or plugin exists yet. The PWA/web runtime uses an HTTP-only cookie, which JavaScript cannot read.

## Deployment

Migration `0059_mobile_phase3_session_devices.sql` must be applied before the Phase 3 web code. No migration, deployment, native build or store submission is performed by this branch alone.
