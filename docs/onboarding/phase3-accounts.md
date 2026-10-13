# Onboarding Phase 3 — account screens and verified recovery

## Result

- `/login` uses the shared blue stationery, yellow book, white panel and serif heading. It lives outside the marketing shell so the designed screen fills the page.
- `/account/setup` retains its existing signed-in provider eligibility check. The username, new password and confirmation form attaches credentials to the same account. There is no registration through the public password endpoint.
- `/account/recover` starts an explicit recovery-purpose Google/LinkedIn transaction through `/auth/recover`. `/account/reset` requires the verified proof. Missing, expired or consumed proof returns the student to recovery.
- Login retains remember-on-device, provider login, server errors, sanitized return paths and local guest access. Setup retains assigned usernames, later/profile actions, 3–30-character username validation and the 12–128-character password contract. Username availability is checked on save, never shown as a fictitious green badge.
- Shared account components render locally in the native bundle. Native provider/password transports and account IDs are retained. Native recovery opens the web verification flow; students return to the app to sign in afterwards. Native remember behavior stays with its existing persistent secure-session contract, so the web-only checkbox is omitted there.
- Bundled illustrations are copied into `native-shell/assets/onboarding` because native account screens now use them. This does not complete Phase 6’s draft storage or offline synchronization gates, and no APK is delivered by this change.

## Recovery boundary

The signed OAuth transaction carries `purpose=recovery`; the callback verifies state, signature, expiry and PKCE using the existing provider machinery. Recovery takes a separate branch before account provisioning, normal session issuance, bootstrap or post-auth routing. Only an exact existing provider subject linked to an active, password-bearing account can receive a proof; email matching cannot recover an unrelated account.

Migration 0093 adds hash-only random proof tokens with account/identity foreign keys, a credential-hash snapshot, ten-minute expiry and a single-use consumption claim. The cookie is HTTP-only, secure in production and SameSite=Lax so provider redirects work; mutations retain same-origin enforcement. The recovery token never appears in a URL or local draft.

Start, issuance and reset checks have server rate limits. Responses use neutral verification failures. The reset operation atomically claims the proof, changes only that account’s credential, invalidates its other recovery proofs, revokes all web/native sessions and consumes pending native exchanges. A unique per-request claim prevents two racing requests from sharing the proof. Snapshot checks reject a proof issued before another password change. The student logs in again after success; study data and username remain untouched.

Account setup now checks the returned credential owner instead of D1’s total change count, which can include alias-trigger work and incorrectly report a successful setup as a failure.

## Verification

- SQL tests exercise the production statements against SQLite: valid reset, wrong account, expiry, replay, stale credentials, disabled account, removed/reassigned provider identity, unsupported identity provider, session/native exchange invalidation and transaction rollback.
- Component rendering checks cover form semantics, password minimum, confirmation fields, offline disabled actions, honest availability text and native bundle boundaries.
- Existing provider/account setup tests retain original-user/data and guest/revoked-session checks.
- Local full repository CI passed: 1,265 tests, TypeScript, ESLint, retirement scan and production Next build. The native bundle also builds. Deployment separately runs additive migration rehearsal, Worker build/size/runtime checks and live public UI checks.

## Remaining verification

A real linked-provider reset requires the account owner to complete provider authentication and enter their new password. Automated SQL and callback boundary checks do not claim that customer flow was exercised. Live checks inspect public login/recovery and reject reset without a proof; they do not change a customer password.

Phase 4 covers the new academic setup schema/screens. Phase 6 integrates the book entry and account handoff with persistent local drafts. Phase 7 remains full device/visual certification and APK install testing. The SVG artwork is the previously documented editable interpretation, with final fidelity review still pending.
