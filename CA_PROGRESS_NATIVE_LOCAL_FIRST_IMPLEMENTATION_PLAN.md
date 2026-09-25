# CA Progress — Native Local-First Application Implementation Plan

Status: Foundations implemented through Phase 20; native product parity and real-device certification incomplete (25 September 2026)  
Repository: `Dellybizz/ca-progress-v2`  
Working branch: `mobile-phase7-student-parity`  
Production origin: `https://caprogress.zanisheluxe.in`  
Native application ID: `in.zanisheluxe.caprogress`  
Plan starts after completed Mobile Phases 0–12.

## Current implementation and evidence — 25 September 2026

- Android and iOS bundled projects, account-isolated SQLite, native authentication, versioned sync, Community, files, notifications and background foundations exist on `mobile-phase7-student-parity`. Automated mobile builds and V2 CI pass at `8ab6d29f`; the subsequent `e9264d49` plan-only commit also passes V2 CI. This is evidence of compilation and tests, not real-phone feature parity.
- Google sign-in has returned to the installed application on a phone. Its final account/session and all-data synchronization path is not yet certified. The screenshots at 01:32–01:33 on 25 September show an installed shell with `Update paused`, `Not selected` academic context, and empty Today, Progress and Syllabus. The profile/Study Buddy SQL arity fix at `8ab6d29f` and subsequent 20A changes through `e6d41c0d` pass CI, deployment and native builds; the latest APK still needs same-account phone proof.
- The current bundled React UI is a separate simplified prototype. It does not reproduce the mobile website's route structure, layout, controls or full feature set. Screenshots of the current APK are evidence of the gap, not proof of completion. Do not describe Phases 18–20 as product-complete based on automated tests alone.
- The Cloudflare rollout at `cf324c7e` passed; this does not establish that the subsequent mobile sync fix or the visual parity work is working on a phone. `main` has not been merged as part of this programme.

### Acceptance target

The installed app must present the **same mobile CA Progress product** as the website: information architecture, navigation, visual hierarchy, content, controls, states and interactions. Its interface must be bundled locally, render previously synchronized account data from SQLite immediately, queue supported edits locally, and reconcile with the existing Cloudflare backend. Online-only operations may require connectivity, but must retain the website's screen and explain that requirement in context. The existing app is an internal prototype until this target is verified.

---

## 1. Programme outcome

Replace the current production-hosted Capacitor WebView with a bundled, local-first mobile application while preserving:

- the existing Next.js website and admin application;
- the existing Cloudflare Worker, D1, R2, Queue and Durable Object infrastructure;
- stable user, guest, academic, payment, entitlement, community and resource identifiers;
- all working website features and production data;
- one account and one authoritative server data model across website, Android and iOS.

The finished application must open from installed assets, render previously synchronized data immediately from the device, and synchronize changes in the background. Community channels and recent messages must already be present locally and receive incremental updates like a modern messaging application.

The target flow is:

```text
Installed React/Capacitor interface
              ↓
     Native SQLite database
              ↓
  Outbox + cursor sync engine
              ↓
     Cloudflare versioned API
       ↙        ↓          ↘
     D1         R2     Durable Objects
```

---

## 2. Non-negotiable rules

1. Do not merge to `main` unless explicitly instructed.
2. Do not remove or destabilize the website while building the native client.
3. Do not let the mobile application access D1 or R2 directly.
4. Do not create a second account, entitlement or payment authority.
5. Do not store raw authentication tokens in SQLite, IndexedDB, logs or ordinary preferences.
6. Do not use a blanket last-write-wins conflict policy.
7. Do not advance a synchronization cursor until the complete local transaction commits.
8. Every retryable mutation must have a stable idempotency key.
9. Deletions must synchronize through bounded tombstones or change events.
10. Account switching must never expose another account’s local records or files.
11. A locally available screen must not be replaced by a blocking loader during refresh.
12. Website content/data updates may synchronize automatically; executable native UI and plugin changes require a signed store release.
13. Store publication, production rollout, signing-key creation and legal declarations remain explicit external approvals.
14. Complete and certify one phase before starting the next phase.

---

## 3. Pre-Phase-13 baseline (historical)

The following inventory describes the starting state before the bundled native work. Use the dated implementation evidence above for the current state.

### Present and reusable

- Next.js 16 and React 19 website.
- Cloudflare OpenNext Worker.
- D1 authoritative database and retained migrations.
- R2 private resource storage.
- Cloudflare Queue jobs.
- Durable Object community coordinator.
- Versioned `/api/v1` boundary and idempotency header contract.
- Hashed, revocable application sessions.
- Android and iOS Capacitor projects.
- Adaptive mobile layouts and shared design tokens.
- IndexedDB snapshot, file and mutation-queue prototype.
- D1 community message sequences.
- Account deletion, release contract and CI/deployment automation.

### Not yet suitable for the final native application

- Capacitor production configuration loads `https://caprogress.zanisheluxe.in` through `server.url`.
- The installed package does not contain the complete application interface.
- Existing offline storage is feature-flagged and is not the production default.
- Existing offline mutation route matching mixes `/api/...` and `/api/v1/...` paths.
- Most API domains expose full screen models rather than real cursor-based deltas.
- Native OAuth returns to the app but authentication remains dependent on a website-origin cookie.
- Community realtime broadcasts refresh signals and then refetches message pages.
- Community messages are not retained in a native local database.
- Native file persistence, secure token storage and background sync are not implemented.

The current Phase 12 APK remains an internal hosted-shell fallback until the local-first cutover is certified.

---

## 4. Target repository shape

Migrate progressively toward:

```text
apps/
  web/                 # existing Next.js website/admin runtime
  mobile/              # bundled React/Capacitor client

packages/
  contracts/           # DTOs, schemas, errors, cursors
  domain/              # pure shared business rules
  ui/                  # shareable visual primitives/tokens
  api-client/          # web-cookie and native-bearer transports
  mobile-data/         # SQLite schema and repositories
  sync-engine/         # bootstrap, pull, push, outbox, conflicts

workers/
  billing/
  icai-sync/
  community-realtime/
```

This structure is a direction, not a mandatory one-commit repository move. Files must be moved only when their dependency boundary is understood and covered by tests.

---

# Phase 13 — Baseline Lock and Architecture Boundaries

## Objective

Create a verified starting point and prevent the native rewrite from duplicating server-only code or silently breaking the website.

## Work

- Record the exact branch SHA, production release contract, D1 migration ledger and current APK artifact.
- Inventory every student route and classify it as:
  - local-first core;
  - local snapshot;
  - online-only;
  - native-excluded/admin-only.
- Inventory each route’s D1 tables, R2 dependencies, entitlement checks and mutation endpoints.
- Document the current `/api` to `/api/v1` rewrite behavior.
- Reproduce and record the current offline URL-mapping inconsistency.
- Add architecture decision records covering:
  - bundled Capacitor React client;
  - SQLite as native local authority;
  - Cloudflare/D1 as server authority;
  - native bearer sessions;
  - change-journal synchronization;
  - typed community realtime events.
- Define packages that may import browser, native, Next.js and server-only modules.
- Add dependency-boundary checks so the mobile bundle cannot import `next/headers`, D1 bindings, secrets or admin services.
- Define performance, storage and reliability budgets.

## Deliverables

- `docs/mobile-local-first/ARCHITECTURE.md`
- `docs/mobile-local-first/ROUTE_DATA_MATRIX.md`
- `docs/mobile-local-first/SECURITY_BOUNDARIES.md`
- `docs/mobile-local-first/PERFORMANCE_BUDGET.md`
- automated dependency-boundary test
- recorded baseline evidence

## Definition of done

- Every student feature has an explicit local/offline policy.
- All local-first entities have named server tables and APIs.
- The website build and complete existing CI remain green.
- No runtime behavior or production data is changed.

## Do not start Phase 14 until

The baseline, route matrix and import boundaries are committed and reviewed.

---

# Phase 14 — Bundled Native Application Foundation

## Objective

Make Android and iOS open a locally installed application interface without contacting the website for initial rendering.

## Work

- Create `apps/mobile` as a React client application.
- Reuse design tokens, icons and pure components without importing Next.js server code.
- Implement local navigation, app bar, bottom navigation, route boundaries and native-safe-area behavior.
- Include deterministic loading, empty, stale, offline and error states in the bundle.
- Replace production `server.url` with a bundled `webDir` build.
- Retain an explicitly development-only live-reload configuration.
- Add application lifecycle handling for cold start, resume, background and deep links.
- Add a minimal local session-selection/bootstrap screen.
- Add build metadata and release compatibility checks.
- Ensure unknown external links open safely outside the app.

## Initial bundled routes

- splash/bootstrap;
- login/account selection;
- dashboard frame;
- Today frame;
- progress frame;
- planner frame;
- Focus frame;
- community frame;
- settings/offline storage frame.

These routes may use placeholder repositories in this phase, but their structure must not require website HTML.

## Tests

- Android cold start with airplane mode.
- iOS cold start with airplane mode.
- no request to the production origin before the local shell is visible;
- deep-link allowlist tests;
- safe-area, keyboard, tablet and rotation tests;
- bundle inspection for server secrets and server-only imports.

## Definition of done

- The app shell opens fully offline from installed assets.
- Navigation works with no network.
- No production `server.url` is present in native release configuration.
- Website and admin behavior remain unchanged.

## Do not start Phase 15 until

A debug APK and iOS simulator build prove the bundled shell works offline.

---

# Phase 15 — Native Authentication and Device Sessions

## Objective

Give the bundled client secure, revocable native authentication without depending on website-origin cookies.

## Work

- Add Authorization Code + PKCE native login initiation.
- Use the system browser for Google and LinkedIn authentication.
- Return through verified Android App Links and iOS Universal Links.
- Issue a one-time, short-lived native exchange code.
- Exchange the code for a high-entropy native session token.
- Store only the token hash in D1.
- Store the raw token only in Android Keystore/iOS Keychain-backed secure storage.
- Add `Authorization: Bearer` support to the shared request-auth layer.
- Preserve HTTP-only cookies for the website.
- Bind native sessions to `client_kind`, device label and application build.
- Add rotation, absolute expiry, revoke-this-device and revoke-other-devices.
- Add safe logout and local-account locking.
- Decide and document guest-device identity behavior before enabling guest mutations.

## API additions

- `POST /api/v1/native-auth/start`
- `POST /api/v1/native-auth/exchange`
- `POST /api/v1/native-auth/rotate`
- `POST /api/v1/native-auth/revoke`
- existing session listing extended for native devices

## Security requirements

- PKCE verifier never leaves the device before exchange.
- Exchange codes are one-use, short-lived and bound to the initiating device transaction.
- Tokens never appear in URLs, logs or analytics.
- Cross-origin browser mutations remain rejected.
- Native bearer access and web-cookie access resolve to the same application user ID.

## Definition of done

- Google and LinkedIn sign-in succeed on real Android and iOS devices.
- Website login remains unchanged.
- Revoking a native session blocks further API access.
- Killing and reopening the app restores the secure session without exposing the token to SQLite or JavaScript logs.

## Do not start Phase 16 until

Authentication penetration checks and account-isolation tests pass.

---

# Phase 16 — Native SQLite Data Layer

## Objective

Create the durable device-side source used for immediate rendering.

## Work

- Add a Capacitor-compatible native SQLite implementation.
- Create transactional, versioned local migrations.
- Add repository interfaces and observable/live-query subscriptions.
- Create account-scoped tables for:
  - application configuration;
  - academic context and catalog;
  - dashboard projection;
  - progress;
  - planner/tasks/goals/revision;
  - study sessions/timer state;
  - notes;
  - notifications;
  - resource metadata;
  - community channels/messages/reactions/read state;
  - sync cursors;
  - mutation outbox;
  - conflicts;
  - tombstones;
  - local file index.
- Store downloaded files in the native filesystem, not as large SQLite blobs.
- Add schema rollback/recovery and corruption handling.
- Add logout policies:
  - lock local data;
  - remove account from device;
  - wipe all offline data.
- Define size limits and eviction rules that never remove pending mutations.
- Evaluate encrypted SQLite/SQLCipher obligations before enabling encryption in release builds.

## Required row metadata

Synchronizable rows must carry, where applicable:

- local ID;
- stable server ID;
- server entity version;
- account ID;
- academic context key;
- local state (`synced`, `pending`, `conflict`, `failed`);
- created/updated timestamps;
- deletion/tombstone state.

## Definition of done

- Local data survives process death and device restart.
- SQLite migrations are repeatable and forward-only.
- Account A cannot query Account B records.
- Database corruption produces a recoverable state instead of a blank application.
- Pending mutations are never evicted by cache cleanup.

## Do not start Phase 17 until

SQLite repository, migration, isolation and process-death tests pass on Android and iOS.

---

# Phase 17 — Server Change Journal and Synchronization Engine

## Objective

Implement deterministic bootstrap, incremental pull and idempotent push between SQLite and D1.

## Server work

- Add a retained D1 migration for a bounded mobile change journal.
- Record each synchronizable canonical mutation and deletion in the same logical operation as its data change.
- Use monotonic server sequence/cursor ordering rather than device timestamps.
- Add bounded tombstone retention.
- Add per-user, context-aware authorization to every sync result.
- Add compact bootstrap and delta DTOs.
- Extend mutation receipts to all offline-capable domains.
- Add server entity versions or equivalent conflict baselines.

## API additions

- `GET /api/v1/sync/bootstrap`
- `GET /api/v1/sync/pull?cursor=...`
- `POST /api/v1/sync/push`
- `GET /api/v1/sync/status`

## Client work

- Add a lifecycle-aware sync coordinator.
- Synchronize on:
  - successful login;
  - app launch after local hydration;
  - app resume;
  - network reconnection;
  - user refresh;
  - push/realtime invalidation;
  - bounded periodic background opportunity.
- Apply each delta page transactionally.
- Advance cursors only after successful local commit.
- Use an ordered outbox with exponential backoff and jitter.
- Preserve dependencies between mutations.
- Stop dependent mutations behind a conflict.
- Expose subtle `updating`, `offline`, `pending`, `conflict` and `failed` states.

## Domain conflict policies

| Domain | Required policy |
| --- | --- |
| Progress stages | merge independent stages; conflict on same stage/version |
| Planner tasks | entity-version comparison and field-level review |
| Notes | retain local and cloud versions for comparison |
| Focus sessions | immutable completion events deduplicated by client ID |
| Read state | greatest acknowledged sequence wins |
| Notification state | monotonic read merge |
| Settings/profile | server-version check with explicit retry/review |

## Definition of done

- First bootstrap can resume safely after interruption.
- Repeated pull with the same cursor is idempotent.
- Repeated push with the same mutation ID cannot duplicate data.
- Deletions reach the device through tombstones.
- Switching academic context cannot misapply queued edits.
- Cursor advancement is transactionally safe.
- Sync load is bounded and indexed in D1.

## Do not start Phase 18 until

Fault-injection tests cover process kill, network loss, duplicate requests, reordered responses, stale versions and account switching.

---

# Phase 18 — Core Student Screens Local-First Cutover

## Objective

Render the daily student experience exclusively from SQLite and update it without browser-style page loads.

## Implementation order

1. Academic context and catalog
2. Dashboard and countdown
3. Today
4. Progress and syllabus
5. Planner/tasks/goals/revision
6. Focus timer and session review
7. Notes
8. Profile, attempts and settings
9. Activity, XP and leaderboards
10. Study Buddy

## Screen contract

Every converted screen must:

- query SQLite on entry;
- render cached content immediately when available;
- show a stable empty state when no local data exists;
- start sync without replacing cached content;
- update only affected components after local database changes;
- save mutations to the outbox before reporting success;
- retain pending state across process death;
- expose stale/offline state without blocking navigation.

## Compatibility

- Existing website routes continue using Next.js server components.
- Shared pure components may be extracted to `packages/ui`.
- Server data loaders must not be imported into the mobile bundle.
- API responses and local entities must be schema validated.

## Definition of done

- Previously synchronized core screens are usable in airplane mode.
- No blocking loader appears when cached data exists.
- Local edits render immediately and survive app termination.
- Online updates merge without route refresh or scroll loss.
- Web and native results converge after successful synchronization.

## Do not start Phase 19 until

Core-screen device tests pass with slow, intermittent and absent network conditions.

---

# Phase 19 — Telegram-Style Community and Realtime

## Objective

Make community channels open from local history and receive ordered incremental updates.

## Server work

- Replace generic refresh-only broadcasts with typed events:
  - `message.created`;
  - `message.updated`;
  - `message.deleted`;
  - `reaction.changed`;
  - `pin.changed`;
  - `read.changed`;
  - `typing.changed`;
  - `presence.changed`.
- Persistent events carry channel ID, sequence, entity ID, version and payload.
- Keep D1 authoritative for messages, moderation, reactions and read state.
- Use Durable Objects for ordered delivery, presence and typing.
- Convert the coordinator to WebSocket hibernation-safe handlers.
- Add incremental endpoints using `afterSequence` and `beforeSequence`.
- Add idempotent client message IDs.

## Client work

- Store channels, messages, reactions, pins and read state in SQLite.
- Open channels from local messages with no initial full-history request.
- Reconcile from the last stored sequence after socket connection/reconnection.
- Insert outgoing messages locally with states:
  - sending;
  - sent;
  - failed;
  - retrying.
- Replace the client UUID with or map it to the acknowledged server ID.
- Load older messages only when scrolling upward.
- Preserve draft text per channel.
- Keep typing and presence ephemeral.
- Add bounded local retention and cache clearing.
- Retain moderation tombstones so deleted content does not reappear offline.

## Definition of done

- A cached channel opens instantly in airplane mode.
- Reconnection downloads only missing message sequences.
- Sending is optimistic, durable and idempotent.
- Duplicate/reordered realtime events do not duplicate or reorder messages.
- Message deletion, reactions, pins and read state converge across two devices.
- WebSocket failure falls back to bounded delta polling without full-page refetches.

## Do not start Phase 20 until

Two-device, process-kill, reconnect, pagination and moderation tests pass.

---

# Phase 20 — Resources, Files, Notifications and Background Work

## Objective

Complete the non-text native data lifecycle without weakening authorization or privacy.

## Resources and files

- Store resource metadata in SQLite.
- Store selected downloads in the native application filesystem.
- Retain file hash, owner, size, MIME type, sync state and server resource ID.
- Refresh expired signed access rather than persisting signed URLs.
- Add direct R2 upload preparation, progress, cancellation and resumable retry where supported.
- Retain offline thumbnails/previews where policy permits.
- Never expose private files across account changes.

## Notifications

- Add native push registration per device/account.
- Store notification center records locally.
- Treat push as an invalidation hint; pull authoritative data afterward.
- Deep-link notifications to bundled routes.
- Revoke device subscriptions on logout/account deletion.

## Background behavior

- Use operating-system-supported background opportunities only.
- Do not promise permanent background execution.
- Keep tasks bounded, resumable and idempotent.
- Never require background execution for correctness; foreground resume must recover everything.

## Definition of done

- Downloaded files reopen offline after app restart.
- Upload retries cannot duplicate R2/D1 records.
- Expired signed URLs are never treated as permanent file identifiers.
- Push for Account A cannot surface after switching to Account B.
- Foreground recovery completes work missed while background execution was unavailable.

## Do not start Phase 21 until

Storage pressure, interrupted transfer, token expiry and account-switch tests pass.

---

# Phase 20A — Authenticated Data and Sync Recovery (required before parity implementation)

Status: Open. The `8ab6d29f` SQLite insert fix has passed CI and Android compilation; real-device verification remains open.

## Work

1. On the same established account, prove OAuth callback, bearer session, application user ID, academic selection, and bootstrap context agree. Never silently substitute a demo account or a `cloud-account` placeholder for a missing server ID.
2. Prove `/api/v1/sync/bootstrap` and pull return authorized profile, attempts, subjects, chapters, progress, tasks and other existing account data. Diagnose non-ready academic context explicitly; preserve any pending local edits.
3. Execute the returned entities through real SQLite transactions, including profile and Study Buddy projections. Check SQL column/value/binding arity for every entity, and verify cursor advancement only after the transaction commits.
4. Show the exact safe sync failure category and a retry action in the app. Never expose bearer tokens, OAuth codes, note/message bodies or signed file URLs in diagnostics.
5. Verify restart, offline launch, reconnect, account switch, context switch and a second no-op sync on a phone. Confirm the website still shows the same account data.

## Definition of done

- The phone shows the user's actual profile, chosen CA level and attempt, academic catalog, progress and planner data after sign-in; no `Not selected` caused by sync failure and no misleading `Update paused` without an actionable reason.
- After one successful sync, the same data is visible in airplane mode and after process death. Another account cannot read it. Local edits reach the same website account exactly once after reconnecting.
- Real-device evidence records the tested APK SHA, Worker deployment, account identity correlation (redacted), SQLite migration version, bootstrap response shape and sync result. Automated tests alone do not close this gate.

Do not move to Phase 20B or claim the app usable while this gate is open.

---

# Phase 20B — Shared Mobile Shell and Parity Inventory

Status: Not started.

## Work

- Record the current authenticated mobile website on representative narrow and wide phones, light and dark mode, with the same account and data as the app. Capture navigation, overlays, empty/loading/error states, keyboard, scrolling and safe areas. Keep these references versioned with the website commit.
- Build a route-and-interaction inventory from the website navigation contract, not the prototype's route list. Include Home/Dashboard, Today, Focus, Progress and More; every More section; deep links; search, attempt switcher, notifications, back behavior and account controls. Mark each route local read/write, cached read with online actions, or online-only with a stable local screen.
- Move shareable design tokens, icons and pure visual components into a framework-neutral package. Adapt website routing and data dependencies behind interfaces usable by both Next.js and Capacitor. Preserve website behavior and avoid importing server modules into the native bundle.
- Replace the prototype app bar, bottom navigation, More menu, typography and page container with the website's mobile shell and interaction patterns. Preserve native safe areas, hardware back and keyboard behavior. Keep the bundled entry fully functional in airplane mode.

## Definition of done

- At matched phone viewport, the shell's labels, order, iconography, spacing, active states, sheets, app bar and navigation behavior match the current mobile website, allowing only documented platform conventions.
- Each website student route has an owner, data policy and test case. No route is silently replaced with a placeholder. The app still launches from bundled assets without network.

---

# Phase 20C — Core Screen Visual and Functional Parity

Status: In progress. Dashboard and Today native screen layout and local task interactions started on `2f3ed48a`; 20C definition of done remains open. Focus, Progress/Chapter Hub, Syllabus, Planner/Calendar/Goals/Revision, Notes, matched screenshots, interaction matrix, and real-device offline/reconnect proof remain outstanding.

Port in a dependency-safe sequence: Dashboard and countdown; Today; Focus and session review; Progress and Chapter Hub; Syllabus and attempt context; Planner, calendar, goals and revision; Notes. For each screen, reuse or adapt website UI components and preserve its content density, controls, state transitions, responsive layout and dark mode. Bind reads to account-isolated SQLite, make supported edits locally atomic with outbox entries, and reconcile from Cloudflare without resetting scroll or transient UI state.

## Definition of done

- Screen-by-screen screenshots at matching viewport, theme, account and data demonstrate layout parity. Interaction checks cover every visible action, including add/edit/delete, filters, dialogs, date/attempt changes and back navigation.
- Cached content renders before network requests; edits survive process death; pending/conflict/error states are clear; reconnection converges with the mobile website. No screen passes solely because it has a similar title and a generic card.

---

# Phase 20D — Remaining Student Features and Cross-Route Parity

Status: Not started.

Complete Community and Study Buddy; Resources, ICAI resources and updates; Activity, XP and leaderboards; Search; Notifications; Profile and every Settings section; Analytics, Forecast and Tests; Pricing, Billing, Feature Tour and account deletion. Include chapter/resource detail routes and all website mobile overlays. Keep server-authoritative billing, entitlements and destructive account operations online, but render their cached context and safe offline state locally. Preserve file vault, message ordering, push and native security boundaries.

## Definition of done

- The route inventory from Phase 20B has no unexplained missing student route, control or interaction. Each online-only action says why connectivity is required and safely resumes or retries according to its contract.
- Full parity checks pass on Android and iOS phones at matched website data, plus airplane-mode, reconnect, account-switch, theme and accessibility checks. All previous mobile and website regression gates remain green.

Do not start Phase 21 or treat the Phase 20 test count as completion until Phases 20A–20D pass their real-device gates.

---

# Phase 21 — Migration, Observability and Reliability Certification

## Objective

Move existing hosted-shell users safely to the local-first client and prove production reliability.

## Migration

- Detect the hosted-shell build and native local schema version.
- Import only sanitized, owner-bound legacy IndexedDB snapshots and pending edits.
- Never import cookies, signed URLs, tokens or unknown legacy mutations.
- Quarantine unsupported legacy edits for export/review.
- Make migration resumable and idempotent.
- Preserve a rollback path to the Phase 12 hosted-shell build during internal testing.

## Observability

- Record privacy-safe metrics for:
  - launch-to-local-content;
  - bootstrap duration;
  - delta size and duration;
  - outbox age;
  - conflict count;
  - socket reconnect count;
  - SQLite migration/corruption failures;
  - upload/download failures;
  - application crashes.
- Never log message bodies, note bodies, raw tokens or signed URLs.
- Add a user-visible diagnostics export with redaction.

## Reliability matrix

- first install;
- upgrade from hosted shell;
- process killed during bootstrap;
- process killed during mutation push;
- offline for multiple days;
- database migration interruption;
- server cursor expiry/full resync;
- account switch;
- academic-context switch;
- storage almost full;
- revoked/expired session;
- WebSocket unavailable;
- Cloudflare API partial outage.

## Required performance targets

- bundled shell visible within 500 ms on a representative mid-range device;
- cached primary screen visible within 1 second;
- no blank screen in airplane mode;
- local message send visible within 100 ms;
- launch synchronization never blocks navigation;
- bounded memory use for long community channels;
- no critical/high privacy, identity, entitlement or data-loss defect.

## Definition of done

- Migration succeeds or safely rolls back without losing queued work.
- Observability proves performance and sync reliability on real devices.
- All reliability scenarios have recorded evidence.
- Full website, API, D1 and mobile regression suites pass on the same commit.

## Do not start Phase 22 until

The release candidate has zero open critical/high defects and no unresolved data-loss path.

---

# Phase 22 — Signed Builds, Store Testing and Controlled Release

## Objective

Ship the certified local-first application through controlled Android and iOS channels.

## Work

- Increment native build and compatibility versions.
- Configure Android upload signing and Play App Signing association.
- Configure Apple Team ID, provisioning, associated domains and certificates.
- Produce signed Android AAB and iOS archive.
- Complete privacy/data-safety declarations from verified runtime behavior.
- Provide reviewer access without exposing owner/admin credentials.
- Capture final phone/tablet screenshots.
- Run the complete device matrix on:
  - current supported Android;
  - oldest supported Android;
  - current supported iOS;
  - oldest supported iOS;
  - phone and tablet form factors.
- Release through internal testing/TestFlight first.
- Promote through staged rollout with crash, sync and authentication gates.
- Retain non-destructive server and store rollback procedures.

## Rollout gates

- 0%: signed artifact and internal team only;
- internal/TestFlight: complete functional and migration matrix;
- closed testing: real-user telemetry and support validation;
- small production percentage: monitor crash, login, sync and outbox health;
- wider rollout only after stable evidence;
- halt/rollback on identity, data loss, entitlement, payment, migration or severe sync regression.

## Definition of done

- Store-signed Android and iOS builds are installed and tested.
- Production rollout has explicit owner approval.
- Store listings and privacy declarations are accepted.
- Monitoring and rollback ownership are documented.
- The Phase 12 hosted-shell fallback is retained only for bounded rollback, then formally retired.

---

## 5. Cross-phase verification strategy

### Unit tests

- API schemas and validation;
- local repository queries;
- conflict policies;
- cursor and outbox state machines;
- message ordering/deduplication;
- redaction and account scoping.

### Integration tests

- D1 mutation + change-journal consistency;
- bootstrap/pull/push cycles;
- duplicate mutation receipts;
- SQLite transactional merge;
- native token issue/rotate/revoke;
- R2 prepare/upload/finalize;
- Durable Object typed events.

### Device tests

- cold/warm launch;
- offline launch;
- background/resume;
- process death;
- account switch;
- network transitions;
- deep links;
- push delivery;
- storage pressure;
- Android hardware back;
- iOS navigation and safe areas.

### Production gates

- full V2 CI;
- native phase tests;
- fresh D1 migration proof;
- retained production migration proof;
- Cloudflare smoke tests;
- exact-SHA deployment evidence;
- real-device evidence;
- signed artifact digest and provenance.

---

## 6. Feature availability target

| Feature | Final local policy | Sync behavior |
| --- | --- | --- |
| Dashboard | cached projection | background delta refresh |
| Today | local-first | tasks/plan deltas |
| Progress | full local read/write | ordered outbox + conflicts |
| Chapter Hub | cached academic workspace | metadata/progress deltas |
| Focus | full local timer | immutable session events |
| Planner/goals/revision | local-first | outbox + entity versions |
| Notes | local-first | preserve both versions on conflict |
| Resources | metadata local, selected files offline | R2 transfer lifecycle |
| Activity/XP | cached | server-derived refresh |
| Search | local academic search + online extended search | index refresh |
| Profile/settings | cached, selected edits local | versioned mutation |
| Study Buddy | cached relationships | online mutation/delta |
| Community | local message history | sequences + realtime events |
| Notifications | local center | push hint + authoritative pull |
| Billing | cached entitlement read | server authoritative; store-specific purchase flow |
| Feature Tour | local progress | account synchronization |

---

## 7. Completion definition for the programme

The programme is complete only when:

- the production mobile build contains its own interface;
- that interface has passed Phases 20B–20D against the current authenticated mobile website for every student route, visual state and interaction;
- the app opens and navigates without network access;
- cached data appears before synchronization;
- synchronization is incremental, transactional and idempotent;
- community history opens locally and updates by ordered events;
- native authentication is secure and revocable;
- files and push are account-isolated;
- website functionality remains intact;
- Android and iOS device matrices pass;
- signed builds complete store-controlled rollout;
- no unresolved critical/high privacy, identity, entitlement, payment or data-loss issue remains.

Until those conditions pass, describe the app truthfully as an internal local-first release candidate, not a completed store application.

## Completion record

| Milestone | Current assessment (25 September 2026) | Remaining evidence |
| --- | --- | --- |
| Phases 13–17 foundations | Implemented in branch; automated suites/builds passed | Native session and sync correctness on a real phone |
| Phase 18 core local screens | Prototype code exists; product acceptance reopened | Website UI/feature parity and populated offline account screens |
| Phase 19 Community | Local and incremental foundation exists | Real account channels, message ordering, moderation/interaction parity, offline/reconnect |
| Phase 20 resources/notifications | Native foundation exists; build passes | Real-device file, push and website parity checks |
| Phase 20A sync recovery | Code changes through `e6d41c0d`: SQL arity fix; account-ID guard; post-commit UI refresh; explicit academic setup and sync errors; account-bound secure session for offline restart. V2 CI `36054565354`, Cloudflare deployment `36054565112`, Android debug and iOS simulator run `36054565063` passed. **Implementation verified in CI; device certification open.** | Same-account phone proof of populated screens, offline restart, reconnect, edits, account/context isolation and second no-op sync. Do not mark Complete before this evidence. |
| Phases 20B–20D UI and feature parity | Not started | Route inventory, matched screenshots, interactions and offline behavior |
| Phase 21 reliability | Not started | Migration, observability and interruption matrix |
| Phase 22 signed store release | Not started | Signing, store testing and controlled rollout |

Record each passed gate with website commit, app commit/APK digest, backend deployment, device/OS, account context and redacted test evidence. Do not mark a milestone complete using screenshots of empty prototype screens or CI success alone.
