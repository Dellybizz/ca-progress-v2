# CA Progress V2 — Admin Security Model

Status: Phase 0 production security contract  
Baseline branch: `phase-12-operations-admin-platform`  
Baseline commit: `53681b85250c293cd15e7c17015e8375851e6d84`  
Baseline date: 2026-09-08

## 1. Purpose

The Owner/Admin platform will eventually control users, moderation, product settings, billing entitlements, rewards, academic publishing, ICAI synchronization, jobs and system operations. This document defines the security floor that all later phases must preserve.

The primary rule is:

> A control is not secure because a button is hidden. Every privileged action must be authorized, validated and audited at the trusted server/service boundary.

## 2. Current authorization baseline

Current application roles are:

- `student`
- `moderator`
- `admin`
- `owner`
- `parent_owner`

The current code has two materially different role concepts:

- `isPrivilegedRole`: moderator, admin, owner and parent owner.
- `canEnterAdminArea`: admin, owner and parent owner only.

This is already an inconsistent policy surface. Some moderation services correctly permit moderators while other admin pages use the narrower admin operator guard. This is why the target architecture must move to **capabilities**, not simply add more role checks.

The Cloudflare request proxy currently provides same-origin protection for unsafe browser mutations. It does not enforce `/admin/*` role authorization. The admin layout currently only renders `AppShell area="admin"`; it has no centralized admin gate.

## 3. Current known security gaps / Phase 1 blockers

1. **No centralized `/admin/*` authorization boundary.** Individual pages/services currently own their own checks.
2. **No unified `/api/admin/*` capability policy.** Each route chooses its own guard.
3. **Role checks are too coarse.** `isPrivilegedRole` intentionally includes moderators, but this is unsafe for financial/ownership actions.
4. **Gamification reward settlement currently shares the moderator-capable guard.** `settle_rewards` must become Owner/capability restricted before the future UI is exposed.
5. **No unified immutable admin audit ledger.** Community, resource and ICAI domains have their own histories, but the platform lacks one cross-system actor/capability audit contract.
6. **The working branch is currently unprotected.** Branch protection/required checks are a production governance requirement before the admin control plane becomes critical.
7. **`wrangler.jsonc` currently has `CA_GUEST_TEST_MODE=true` while the application environment is marked production.** This must be deliberately reviewed before final production hardening. Phase 0 does not change it because that would be a runtime behavior change outside inventory scope.

## 4. Target role and capability model

Roles remain useful as presets. They must not be the final authorization primitive.

Suggested capabilities include:

### Command center
- `admin.dashboard.read`
- `admin.alerts.read`

### Users
- `users.read`
- `users.suspend`
- `users.sessions.revoke`
- `users.onboarding.reset`
- `users.profile.correct`
- `users.feature_override`
- `users.export`
- `users.delete`

### Staff
- `staff.read`
- `staff.manage`
- `parent_owner.manage`

### Community/resources
- `community.read`
- `community.moderate`
- `community.configure`
- `community.verification.manage`
- `resources.read`
- `resources.moderate`
- `resources.configure`
- `storage.read`
- `storage.manage`

### Billing
- `billing.read`
- `billing.manage`
- `billing.plan.configure`
- `entitlements.override`

### Academic / ICAI
- `academic.read`
- `academic.edit`
- `academic.publish`
- `icai.read`
- `icai.run`
- `icai.review`
- `icai.configure`

### Gamification
- `gamification.read`
- `gamification.review`
- `gamification.configure`
- `leaderboard.configure`
- `referrals.configure`
- `rewards.settle`

### Operations
- `jobs.read`
- `jobs.retry`
- `jobs.cancel`
- `system.read`
- `system.configure`
- `system.recovery`

### Product / communications
- `product.features.configure`
- `notifications.manage`
- `content.manage`

### Security / audit
- `security.manage`
- `audit.read`

Capabilities may be made more granular as implementation requires; they must not be collapsed simply to reduce coding work.

## 5. Suggested default role presets

| Capability family | Moderator | Admin | Owner | Parent Owner |
|---|---:|---:|---:|---:|
| Admin command-center read | limited | yes | yes | yes |
| User search/read | limited support context | yes | yes | yes |
| Suspend user / revoke sessions | no by default | scoped | yes | yes |
| Community moderation | yes | yes | yes | yes |
| Community configuration | no | scoped | yes | yes |
| Resource moderation | yes | yes | yes | yes |
| Storage destructive operations | no | no by default | yes | yes |
| Anti-cheat review | yes/scoped | yes | yes | yes |
| Reward settlement | **no** | no by default | yes | yes |
| Billing read | no | scoped | yes | yes |
| Entitlement override | no | no by default | yes | yes |
| Academic publish | no | no by default | yes | yes |
| ICAI run/review | no by default | yes | yes | yes |
| ICAI source configuration | no | scoped | yes | yes |
| Jobs read | no | yes | yes | yes |
| Jobs retry/cancel | no | scoped | yes | yes |
| Staff management | no | no | yes | yes |
| Parent Owner transfer/control | no | no | no | **yes** |
| Backup/restore | no | no | Owner if explicitly granted | yes |

Exact defaults must be encoded once, server-side, with tests. The UI should consume the same effective capability model rather than duplicate it.

## 6. Authorization flow

Target flow for every admin request:

1. Resolve the Cloudflare authenticated application identity.
2. Resolve trusted application user and account state.
3. Resolve role preset and effective capabilities from trusted server-side state.
4. Confirm the required capability for the requested action and target scope.
5. Validate target ownership/scope rules to prevent IDOR.
6. Validate the request body using action-specific rules.
7. For L3/L4 actions, validate recent-auth/re-auth requirements and explicit confirmation data.
8. Execute canonical service mutation.
9. Record immutable audit data atomically or with failure-safe semantics.
10. Return only sanitized response data.

Never accept role/capability/price/ownership claims from the browser.

## 7. Central admin boundary contract

Phase 1 must provide a centralized admin entry boundary for `/admin/*`.

It should:

- reject unauthenticated users;
- reject ordinary students;
- permit only the appropriate admin-area roles/capabilities;
- retain separate moderation workflows for moderators where moderation access is intentionally allowed;
- never replace route/service-level authorization.

The page gate is defense in depth and user experience. The service/API gate remains authoritative.

## 8. API and server-action requirements

Every `/api/admin/*` route and admin server action must:

- specify its required capability explicitly;
- authenticate server-side;
- validate body/params server-side;
- reject invalid IDs and impossible enum values;
- not expose raw provider/internal errors to the browser;
- use `private, no-store` for sensitive admin responses unless a stronger existing pattern applies;
- call a canonical service rather than embed large business logic in the React component;
- be safe under duplicate submit/retry;
- produce an admin audit event for mutations.

Large generic endpoints such as `POST /api/admin?action=...` should be avoided for unrelated domains.

## 9. Origin / CSRF protection

The current Cloudflare/Next proxy rejects cross-site unsafe requests using `Sec-Fetch-Site` and `Origin` checks. Preserve this baseline.

Later phases must not weaken it by:

- bypassing the normal request boundary;
- accepting state-changing GET requests;
- exposing service-worker/private Worker write endpoints directly to browsers without equivalent authentication.

High-risk operations should additionally use one-time/recent-auth confirmation semantics where appropriate.

## 10. Risk levels and confirmation rules

### L0 — read-only

Examples: metrics, health, audit, user lookup.

Requirement: capability + privacy scoping.

### L1 — reversible configuration

Examples: dashboard widget toggle, slow mode, reminder defaults.

Requirement: validation + audit + optimistic concurrency/version check where useful.

### L2 — user-affecting mutation

Examples: suspend account, block Community access, revoke sessions.

Requirement: reason + confirmation + idempotency + audit.

### L3 — financial/security/publishing

Examples: entitlement override, reward settlement, syllabus publish, plan-policy publish, staff role change.

Requirement: narrow capability + reason + preview/diff + explicit confirmation + recent auth where practical + immutable audit + rollback strategy.

### L4 — destructive/recovery/ownership

Examples: account-data deletion, destructive R2 cleanup, backup restore, Parent Owner transfer, platform-wide destructive switches.

Requirement: Owner/Parent Owner policy + re-authentication + typed confirmation + dry-run/impact preview + recovery protection + immutable audit.

## 11. Unified audit event contract

Every sensitive admin mutation should be representable with:

- `id`
- `actor_user_id`
- `actor_role`
- `capability`
- `action`
- `target_type`
- `target_id`
- `scope`
- `previous_value` (sanitized JSON where appropriate)
- `new_value` (sanitized JSON where appropriate)
- `reason`
- `request_id` / correlation ID
- `source_surface`
- `reversible`
- `undo_reference` where safe
- `created_at`

Secrets, raw payment payloads and private content must not be copied into audit JSON merely for convenience.

Existing domain histories such as Community moderation, resource moderation and ICAI review should be linked to or mirrored by the global admin audit without deleting their domain-specific evidence.

## 12. Idempotency and concurrency

Admin operations will be retried by users, browsers, Queues and Workers. Critical mutations must tolerate duplication.

Use, as appropriate:

- stable idempotency keys;
- unique constraints;
- version/revision checks for configuration;
- D1 batch/transaction semantics;
- compare-before-update for stale admin forms;
- queue job ledgers;
- existing unique provider event keys for billing.

Reward settlement, entitlement grants, notification sends, academic publish and job retry are especially sensitive to duplicate execution.

## 13. Privacy model

Owner control does not imply unrestricted visibility into private student content.

Rules:

1. Private notes/files must not automatically appear in moderation queues.
2. Resource moderation should operate on shared/reported content and metadata needed for safety.
3. Study Buddy sharing remains directional and opt-in; admin tools must not silently widen sharing.
4. Support views should show summaries by default and disclose private content only when a legitimate, explicitly designed support/safety workflow requires it.
5. A future “View as user” mode should be read-only by default, visibly bannered and audited. No silent impersonation.
6. Authentication secrets, session tokens, OAuth tokens and payment secrets are never readable.

## 14. Billing and entitlement security

Billing rules:

- Browser-provided prices are never canonical.
- Payment provider signatures and provider references are verified server-side.
- Payment/order/event history is evidence and must not be rewritten by manual entitlement changes.
- Manual grants, reward grants and paid subscriptions must remain distinguishable by source.
- Manual grants require a reason and should have an expiry/automatic revert unless explicitly permanent by policy.
- Reward settlement must be Owner/capability restricted and idempotent.
- Plan policy changes require draft/validate/preview/publish semantics once made configurable.

## 15. Academic and ICAI security

Academic history and ICAI verification have elevated integrity requirements.

Rules:

- stable IDs are preserved;
- published syllabus history is never destructively overwritten;
- new academic edits use versioned draft/publish semantics;
- high-impact ICAI changes require review;
- append-only ICAI review decisions remain authoritative evidence;
- source configuration must validate official domains/URLs and parser compatibility;
- cache invalidation must follow approved canonical changes;
- rollback restores a prior valid version/state rather than deleting history.

## 16. Community / resource moderation security

Moderation roles may act only within their intended scope.

- Moderator access does not imply billing, staff, reward or academic publish access.
- Moderation reasons should be explicit for stronger enforcement.
- Permanent/global bans require stronger confirmation than a temporary channel block.
- Bulk moderation needs bounds and preview.
- Private student files are not ordinary moderation content.
- Destructive resource/R2 actions require separate storage capability from ordinary moderation.

## 17. R2 and storage security

The browser should use approved signed/direct upload flows; it must not receive storage credentials.

Admin storage controls must operate through trusted services and should expose metadata before content.

Destructive cleanup requires:

- orphan/abandoned proof;
- dry-run count/bytes;
- bounded batch size;
- confirmation;
- audit;
- recovery/quarantine where possible.

## 18. Jobs and operations security

Jobs can contain sensitive payloads. Admin UI should render sanitized summaries, not raw payload dumps by default.

Retry/cancel/requeue must:

- verify job type supports the operation;
- preserve idempotency keys or deliberately generate a traceable new execution;
- record actor/reason;
- not bypass the canonical Worker/service consumer.

## 19. Secrets and configuration

Never display secret values. Show only safe configuration state such as:

- `Configured`
- `Missing`
- `Last verified`

Do not store arbitrary executable HTML/JavaScript as an admin-managed content shortcut.

## 20. Code-owned invariants

The following remain stronger than owner configuration:

- authentication cryptography and token/session validation;
- authorization enforcement and the capability safety floor;
- provider payment verification;
- schema/foreign-key/index/migration rules;
- stable ownership IDs;
- immutable/append-only historical evidence;
- trusted Worker bindings and service authentication;
- hard min/max safety bounds;
- secret handling/redaction;
- same-origin/CSRF baseline.

## 21. Branch and deployment governance

The Phase 0 baseline branch is currently unprotected. Before final production rollout of powerful admin mutations:

- enable appropriate branch/ruleset protection;
- require authoritative CI checks;
- avoid direct unreviewed changes to production-critical admin authorization;
- preserve a known-good deployment/rollback process;
- record deployment SHA in operations health.

This governance is intentionally outside normal in-product Owner toggles.

## 22. Phase 1 mandatory acceptance criteria

Phase 1 is not complete until:

1. `/admin/*` has a centralized authenticated admin boundary.
2. A server-side capability model exists and is tested.
3. `/api/admin/*` mutations declare/enforce capabilities.
4. Moderator can still perform intended moderation but cannot settle subscription rewards or perform Owner financial/ownership actions.
5. Global admin audit infrastructure exists.
6. High-risk action confirmation primitives exist.
7. Guest/student/moderator/admin/owner/parent_owner negative and positive permission tests pass.
8. Existing Community, resource and ICAI admin functionality continues to work.
