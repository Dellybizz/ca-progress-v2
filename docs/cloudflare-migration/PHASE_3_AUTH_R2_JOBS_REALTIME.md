# Cloudflare Migration Phase 3 — Authentication, R2, Jobs and Realtime

Status: target runtime implementation prepared; production cutover intentionally deferred.

Source branch at Phase 3 start: `phase-12-operations-admin-platform` @ `737617e0612f7e0353078d06a138bcefc3ea966e`.

## 1. Scope and non-goals

Phase 3 removes the remaining non-database Supabase runtime requirements from the **Cloudflare target implementation** while preserving the current production source until later migration phases.

This phase does **not**:

- bulk-copy live production relational data to D1;
- switch production reads/writes exclusively to D1;
- retire Supabase;
- delete legacy Supabase Storage objects;
- activate Worker auth for all production users;
- start Migration Phase 4;
- start CA Mentor Phase 3 or create Mentor source-ingestion jobs.

## 2. Authentication architecture

### Permanent application identity

`app_users.user_id` is the permanent application ownership key. Phase 3 exposes the conceptual `users` model as a D1 view and adds:

- `auth_identities(provider, provider_user_id, application_user_id, ...)`;
- `sessions(application_user_id, auth_identity_id, token_hash, expiry/revocation data)`.

Authentication-provider IDs never become resource/progress/planner/billing/community ownership keys.

### Existing Supabase user mapping

Current application data is already owned by Supabase `auth.users.id`. The deterministic import rule is therefore:

```text
application_user_id = existing Supabase auth.users.id, unchanged
```

For each existing provider identity, Phase 4 will import an `auth_identities` row that points to that unchanged application user ID. Provider subject and email are aliases/metadata only. Email is never used for automatic account linking.

This preserves ownership of progress, progress events, planner/Today Plan, study history, notes/resources, community history, subscriptions, payment/billing history and Mentor Phase 1/2 records without rewriting their user IDs.

### Login methods

The repository's current intended login surface is Google OAuth plus LinkedIn OIDC. Phone OTP was explicitly removed by `supabase/migrations/20260830020300_phase2_social_login_only.sql`, so Phase 3 does not reintroduce phone login.

### Worker session security

`lib/auth/cloudflare.ts` implements the target Worker session runtime:

- OAuth authorization-code flow;
- `state` validation;
- PKCE S256 verifier/challenge;
- signed, one-time OAuth transaction cookie;
- opaque random application session token;
- only SHA-256 token hash stored in D1;
- HttpOnly session cookie;
- Secure in production;
- `SameSite=Lax`;
- idle expiry and absolute expiry;
- explicit session rotation with old-session revocation;
- logout revocation;
- server-loaded role from `app_users`;
- server-loaded active subscription entitlements from D1;
- no browser-provided admin/subscription flags.

Unsafe cookie-authenticated requests are protected by same-origin / `Sec-Fetch-Site` checks in the Cloudflare auth proxy; explicit auth/avatar mutation routes also use the same-origin assertion. OAuth login CSRF is independently protected by signed transaction cookie + state + PKCE.

`CA_AUTH_RUNTIME=cloudflare` selects the target Worker auth implementation. Production remains on Supabase Auth until a later cutover phase.

## 3. R2 storage architecture

User resource bytes were already R2-backed before this phase. Phase 3 moves remaining new avatar storage to the same private R2 binding `USER_RESOURCES_R2`.

Avatar object keys:

```text
avatars/<application_user_id>/<random-uuid>.<extension>
```

Properties:

- owner encoded by stable application-user prefix;
- owner also stored in R2 custom metadata;
- MIME/content metadata preserved;
- private cache metadata used;
- authenticated application route performs reads;
- path traversal / cross-owner keys are rejected;
- delete is allowed only for owned R2 avatar keys;
- failed profile attachment deletes the newly uploaded R2 object;
- old R2 avatar is deleted only after a replacement succeeds.

While Supabase remains the production source, legacy Supabase avatar objects retain a temporary provider-neutral signed-read fallback. Cloudflare-auth mode does not use that fallback. Legacy source objects are not deleted in Phase 3; their bulk copy/reconciliation belongs to Phase 4.

Resource metadata, visibility, database references and quota/moderation behavior remain in the active database provider until relational cutover.

## 4. Jobs, Queues and Cron

### ICAI sync

The existing daily `30 0 * * *` schedule is preserved.

Target path:

```text
Cron Trigger
  -> BACKGROUND_JOBS Queue
  -> idempotency ledger in D1
  -> ICAI_SYNC_SERVICE /run
```

Queue jobs use deterministic keys:

```text
icai-sync:<scheduled timestamp>
```

`background_job_executions` stores payload hash, status, attempt count and failure information. A successful key is acknowledged without re-running. Reusing a key with a different payload is rejected. Failures are retryable and do not mark success.

Until the production Queue binding is activated, the current direct service-binding cron path remains as a transitional fallback. This avoids a premature production infrastructure switch.

### Billing

Billing remains on the existing signed/idempotent Billing Worker service path. Phase 3 does not introduce an asynchronous payment mutation that could weaken reconciliation guarantees or double-apply payment state.

### Other jobs

The Phase 1 audit did not identify another active Supabase non-database scheduled workload that requires a new Queue implementation in Phase 3. No speculative cleanup/notification/resource-processing queue is added.

No CA Mentor Phase 3 job type exists.

## 5. Realtime/community architecture

The actual browser Supabase Realtime dependency was `lib/community/realtime-provider.ts`, which subscribed to changes in community messages, reactions and pins purely to trigger UI refreshes.

Durable ordering, moderation, blocks, announcements/pins, deletes, reactions and unread/read state already live behind server APIs and relational persistence. There is no retained presence, typing or room-coordination state requiring a stateful coordinator.

Phase 3 therefore replaces Supabase Realtime with provider-neutral polling invalidation:

- message/reaction refresh approximately every 2.5 seconds while visible;
- pin refresh approximately every 10 seconds;
- immediate refresh when the tab becomes visible again;
- subscription cleanup on unmount/channel change.

No Durable Object or WebSocket binding is introduced because current functionality does not require stateful realtime coordination. D1 remains the target durable community history store.

## 6. Provider-neutral service boundary

`lib/data/phase3-service-adapter.ts` records the active and target implementations for:

- authentication/session identity;
- persistence;
- R2 resource/avatar bytes;
- scheduled/background work;
- community invalidation.

Application-facing auth/profile/community modules use provider-neutral boundaries. Supabase-specific auth/storage/realtime code is not required by `CA_AUTH_RUNTIME=cloudflare`; production fallback code remains only because cutover has not happened yet.

## 7. Validation configuration

`wrangler.phase3.jsonc` is validation-only and binds:

- D1 `DB`;
- R2 `USER_RESOURCES_R2`;
- Queue `BACKGROUND_JOBS` producer/consumer;
- `ICAI_SYNC_SERVICE`;
- `BILLING_SERVICE`;
- existing cron schedule;
- `CA_AUTH_RUNTIME=cloudflare`.

It does not create or activate the production D1/Queue cutover.

Phase 3 validation includes:

- static auth/security/identity mapping tests;
- clean local D1 bootstrap with stable mapping, hashed session and job idempotency assertions;
- R2 ownership/access architecture tests;
- jobs/Queue/Cron/idempotency tests;
- realtime/community replacement tests;
- Phase 2 regression tests;
- TypeScript typecheck;
- lint;
- Next production build;
- OpenNext Worker build;
- existing Worker dry-runs;
- Phase 3 Worker dry-run with D1/R2/Queue/service bindings;
- Cloudflare SSR smoke checks;
- repository-wide tests, with any pre-existing failures recorded separately.

## 8. Rollback and activation safety

Phase 3 is additive and reversible before cutover:

- production auth remains Supabase Auth by default;
- production relational persistence remains Supabase;
- no production D1 or Queue binding is activated by the validation config;
- source storage is not deleted;
- community durable records are not rewritten;
- reverting Phase 3 code restores the previous runtime without data rollback.

Phase 4 must not begin until this phase's targeted validation is green and the implementation record is finalized.
