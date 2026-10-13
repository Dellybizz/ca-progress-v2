# CA Progress V2 — Scenario Implementation Master Plan (P00–P33)

Date: 2026-10-13
Scope: Implement the approved scenario decision register in the CA Progress website and offline-first Android APK. Onboarding design and payment-flow changes are out of scope; existing storage entitlements must be respected.
Authoritative policy: [SCENARIO_DECISIONS.md](./SCENARIO_DECISIONS.md)
Status: **Planning only. No code or infrastructure changes are claimed by this document.**

## 1. Verified current baseline

- Main repo: `Dellybizz/ca-progress-v2`, branch `main`.
- Runtime: Next.js 16 / OpenNext on Cloudflare Workers; D1 database; R2 user-resources bucket; Queues; background service Workers; Cloudflare cron.
- Existing browser offline implementation: `lib/offline/{database,mutation,projection,atomic}.ts`, IndexedDB `ca-progress-offline`, service worker, offline API and UI. **Do not replace it blindly**; first characterize and migrate its semantics safely.
- Existing resource routes include `app/api/resources/upload-url/route.ts` (R2 signed PUT intent), `app/api/resources/[id]/route.ts` (PATCH/DELETE), and R2 presigning utilities. These must be audited for immutable-source rules and restricted raw-file delivery.
- Existing `app/api/exports/backup/route.ts` and `lib/exports/` produce an exportable backup; permissions and inherited no-export checks must be incorporated at all paths.
- D1 migrations currently run through 0058; new changes must use additive, ordered migrations and be tested on a production-like snapshot.
- The root repo does **not** visibly contain a native Android Gradle/Capacitor project. Locate the authoritative mobile project/build pipeline before committing to native implementation. Do not assume the browser/PWA alone delivers native offline guarantees.
- `docs/ARCHITECTURE.md` and some older setup documents still describe historic Supabase/Phase-0 topology. Verify active code/production Cloudflare bindings rather than treating these stale documents as runtime truth.
- Policy register has S0-001–S0-036 plus approved amendments/conflict/security decisions. The owner's S0-037=C (smart validation: reject corrupted/unsafe; store safe unsupported without preview) has been stated but was not recorded as an S0-037 entry at planning time.

## 2. Non-negotiable invariant model

1. **Published original** = permanently immutable content snapshot; even owner/admin cannot edit it. Publisher can control *access*, not bytes.
2. **Student-owned private file** = distinct identity and ownership. A lawfully saved View Only copy stays **read-only**; editability must be granted at share creation, with saving enabled.
3. **Temporary or pinned offline cache** = authorized local copy, not independent ownership; share revocation purges after next verified reconnection. Shared-file pins are **device-specific**, and Clear Cache preserves pins.
4. **No-export/restricted file** = may be readable in an encrypted CA Progress viewer and saved internally only if permitted; file, derivatives and histories inherit no-export classification. Ordinary backup exports exclude protected content. Do not claim unbreakable DRM or instant offline revocation.
5. **Sharing** has two distinct paths: (a) direct reference to an original (optionally unlimited onward sharing, still controlled by original owner) and (b) independently published personal-version snapshots (per-hop permission, unaffected by ordinary ancestor-source withdrawal).
6. **Deletion** = eligible student items to 30-day Trash, then expiration or confirmed permanent erase. **Nonempty folders cannot be deleted until every item is moved to a safe destination** (latest amendment supersedes original S0-002 cascading-folder-trash rule).
7. **Offline edits** = durable local save before reporting success, invisible background retries, dependent operations ordered, independent operations partially committed; latest reliable edit wins, but uncertain branches both survive with last confirmed common revision shown in the editor.
8. **Version history** = incremental base + deltas and selective checkpoints, verified reconstruction, preservation of unresolved branches even past configured retention limits, no automatic storage reclamation of students' content.
9. **Device security** = a verified remote wipe takes priority over unsynced data, executes after device reconnects, and cannot be claimed complete beforehand. Ordinary sign-out uses protected account-scoped local queues.
10. **Cloud failure** = no routine sync UI; only a non-blocking *actionable* error for a permanent upload blocker, saying local save is not cloud backup. Real cloud backup requires server-verified object completion.

## 3. Execution structure

Implement **34 sequentially identified phases** grouped into seven workstreams. The numeric order is a recommended delivery order; independent engineering work can proceed in parallel **only after prerequisites and shared contracts are frozen**.

### Stage A — Policy freeze, audit, and rollback foundations

**P00 — Policy freeze and decision reconciliation**
- Record S0-037=C in `docs/SCENARIO_DECISIONS.md` without confusing policy approval with implementation.
- Generate executable requirements matrix: policy ID -> affected web/API/native/D1/R2 surfaces -> tests -> completion evidence.
- Mark superseded premises unambiguously (S0-002 folder cascade; old published-original editing; S0-029).
- Keep unknown scenarios unresolved rather than selecting answers for the owner.
- Gate: all approved decisions have a single effective precedence and traceable test IDs.

**P01 — Current-code and mobile-project inventory**
- Catalogue notes, resources, folders, chapter links, shares, export endpoints, offline queues, background jobs and session/device auth.
- Identify authoritative native Android project/release pipeline (or record need to create one). Inspect current deployed branch, web/D1/R2 bindings, permission model and production file exposure.
- Capture baseline unit/integration tests, local/web offline behavior, worker bundle sizes, APK startup/responsiveness and storage use where available.
- Gate: reproducible baseline, current code-vs-policy gap report, verified mobile build provenance.

**P02 — Canonical file/event/permission contracts**
- Define object taxonomy: published snapshot, private owned copy, restricted read-only private copy, temporary cache, offline pin, revision/delta, Trash/tombstone, share grant, device.
- Define stable IDs, provenance, inheritance of read-only and no-export, owner vs recipient vs platform roles, share-time immutable settings, valid state transitions.
- Specify file-copy handling when publisher revokes access; time/order provenance; retention and quotas; user-actionable sync error taxonomy.
- Gate: schema diagrams and API/permission invariants approved before migrations.

**P03 — Staging, feature flags, migration rollback**
- Establish isolated test fixtures/copy, additive migrations, backfills, release flags, old/new-read comparison, staged smoke tests and rollback plan.
- Protect active user records, billing entitlements, ICAI reference data and old offline mutation queues.
- Gate: deploy/rollback drill without irreversible user-data changes.

### Stage B — Separate Cloudflare, R2, encryption, and upload setup

**P04 — D1 metadata/schema setup [SEPARATE SETUP]**
- Add versioned D1 tables for file entries, immutable source snapshots, ownership, source lineage, copy restrictions, version graph, changed chunks, share grants/blocks, Trash, upload sessions, quotas, device sessions, wipe commands, event receipts and audit logs.
- Add indexes, constraints, provenance relationships, idempotency keys and transactional invariants. Backfill existing resources without republishing/modifying snapshots.
- Gate: migrations and inverse compatibility smoke pass; constraints prevent editing immutable original.

**P05 — R2 bucket/keyspace and delivery setup [SEPARATE SETUP]**
- Inventory and classify existing R2 blobs and GET/PUT URLs; define isolated object prefixes or buckets for originals, encrypted protected content, private deltas/checkpoints, transient uploads and eventual purge.
- Restrict raw GET/public access to non-downloadable blobs. Keep approved direct PUT intents only when finalization validates ownership/quotas/content.
- Define object lifecycle, reference counts, reachability, orphan cleanup **without deleting logical student content for space**.
- Gate: unauthorized raw/guessable GET and cross-owner object reads fail.

**P06 — Threat model and file-encryption protocol [SEPARATE SETUP]**
- Establish content encryption formats, authenticated integrity, key hierarchy (per-content key with controlled wrapping), metadata classification, re-encryption/revocation boundaries, browser-vs-Android capabilities, offline-key limits and audit requirements.
- Design for no-export inherited restrictions and immutable originals; specify what can and cannot be protected against on a hostile authorized client.
- Gate: reviewed crypto protocol, documented recovery/key-loss/rotation decisions, no secret embedded in the APK/web bundle.

**P07 — Key service and device key lifecycle [SEPARATE SETUP]**
- Implement controlled issuance/rotation/revocation and server-side key wrapping under Cloudflare-supported secrets/managed keys; bind authorized offline device keys to the account and content grant.
- Use Android Keystore where available; Web Crypto protections for browser with realistic threat boundaries. Never use the same accessible master key for all students.
- Gate: isolation, revoked account/device denial, rotation and offline-reopen tests pass.

**P08 — Protected file delivery gateway [SEPARATE SETUP]**
- Build authorized protected-file delivery and viewer key-grant pathways; never return direct plaintext R2 links for restricted files through app, export, preview or admin routes.
- Keep ordinary export-allowed routes separate and authorized. Add download-denial, cache-control, replay, tampering, range-request and cross-account tests.
- Gate: direct backend, R2 and signed-URL bypass tests pass.

**P09 — File validation and safe unsupported storage**
- Implement owner's selected S0-037=C: verify actual bytes, size, MIME/signature, reject corruption or unsafe payloads; allow safe unsupported types as protected storage without in-app preview.
- Apply validation at upload finalization, not just extension/UI. Treat malware/quarantine decisions and formats that cannot be safely verified explicitly.
- Gate: malicious, truncated and mismatched files fail safely; safe unsupported files store and download/preview permissions remain intact.

**P10 — Resumable upload transfer setup [SEPARATE SETUP]**
- Add chunked/multipart upload sessions, verified offsets/hashes, interrupted-session recovery, atomic finalize, reservations, retries, idempotent commits and quarantine before publication.
- Preserve local originals and outbox state through interruptions/restarts. Mark backed up only after verified server acknowledgement.
- Gate: network drop, duplicate chunk, restart, partial failure and integrity tests.

**P11 — Storage quota and accounting setup [SEPARATE SETUP]**
- Define *logical usage* vs *physical R2 bytes*, dedup/reference accounting, encrypted overhead, retained revisions, pending uploads and per-device cache usage.
- Read existing entitlement limits from live billing service; do not change plan prices/upgrade flows. Enforce atomic quota reservations and release after safe cleanup.
- Gate: no quota bypass, double charging, silent auto deletion or phantom cloud-backup success.

### Stage C — Separate browser, Android APK, and synchronization setup

**P12 — Browser offline store migration**
- Version and migrate current IndexedDB stores safely, including existing queued drafts and cached files. Add account-scoped encrypted local file metadata, revision/dependency graph, pinned cache state and blocked/queued distinctions.
- Make service-worker assets available offline; avoid relying on web-only persistent-storage guarantees. Ensure no loss on schema upgrade.
- Gate: offline app boot, migration replay, stale-tab, local quota and same-account sign-out cases pass.

**P13 — Android native project/bootstrap [SEPARATE SETUP]**
- Verify/recover existing authoritative Android source/build project; otherwise create a dedicated compatible Android shell/project connected to the same CA Progress APIs.
- Bundle application shell, navigation, screens and static assets inside the APK rather than network-loading the UI; set up Gradle/Android SDK, signing, CI build, debug APK and emulator tests.
- The user's preferred larger APK budget (up to approximately 100–300 MB) may be accepted for offline assets, but don't ship users' private data or crypto secrets inside it.
- Gate: clean install, first offline launch and repeatable signed/test APK build on emulator.

**P14 — Android encrypted local DB/files [SEPARATE SETUP]**
- Configure reliable on-device metadata and content storage (native SQLite/Room or equivalent) and protected file vault keyed by Android Keystore; migration/storage-pressure/sign-out tests.
- Share API contracts with web without copying browser IndexedDB assumptions into Android. No plaintext external shared-storage output for protected files.
- Gate: offline read/edit/relaunch and account separation, key-loss handling, corrupt-cache recovery.

**P15 — Android native background jobs [SEPARATE SETUP]**
- Implement OS-appropriate background upload/retry workers, persisted outbox and resumable transfers; obey network/battery constraints while avoiding false promises about instant background work.
- Implement offline file viewer bridge, queued wipe-command reconciliation and device-specific Keep Offline pins.
- Gate: survive process death, app upgrade, lost network, device restart and long offline sessions on emulator/real devices where available.

**P16 — Universal sync protocol and conflict metadata**
- Define ordered durable mutation envelope: device ID, user ID, entity ID, base revision, operation ID, dependencies, timestamp confidence and transaction preconditions.
- Server uses reliable event ordering and clock-offset metadata; never blindly trust client time. Use operation receipts and authoritatively reject unauthorized writes.
- Gate: duplicate/offline/out-of-order concurrency tests; latest reliable edit wins while uncertainty preserves branches.

**P17 — Background retry/orchestration and actionable errors**
- Extend Queues/server workers and web/native outboxes with bounded retries, dead-letter diagnostics, dependency-aware parent-first updates, independent partial success and authenticated replay.
- Never show routine sync indicators. Show nonblocking action-required warnings with accurate **saved locally, not cloud-backed-up** wording only for persistent user-fixable blockers.
- Gate: outage, bad auth, storage cap, permission revocation, partial batch and replay failures.

**P18 — Owned-file multi-device sync**
- Locally save permitted owned files first; securely sync whole verified base/snapshots, then optimized changes to other signed-in devices where device space allows.
- Keep shared-original temporary caches/pins out of owned-file replication: pins stay local to device. Preserve offline data and chapter links across devices.
- Gate: phone->web->tablet changes agree after connectivity, without unauthorized independent copies or data loss.

### Stage D — Immutable publication, sharing, revocation, protected viewing

**P19 — Immutable publication and private-copy creation**
- Publish frozen immutable snapshots from private working files; no owner/admin/source write-after-publication endpoints.
- Create lawful independent private copies with stable IDs, source lineage and inherited edit/no-export classification.
- Gate: admin/owner/public endpoint tampering cannot edit a frozen source; private edits never mutate published bytes.

**P20 — Share-time permission configurator**
- Controls: View Only/Edit Personal Version, Save to Private Files, Tag to Chapter, direct-original re-sharing mode, personal-version redistribution, Allow Download, selected people/public visibility.
- Validation: Save Disabled -> cannot create personal version or edit/tag durably; View Only + Save Enabled -> saved private copy remains read-only; Edit Personal Version -> requires saving. No-export inherits through copies.
- Settings for an existing share's edit capability are not silently mutable after sharing; owner access restrictions are separate.
- Gate: every permission-combination matrix is enforced in API and UI.

**P21 — Share graph and re-share paths**
- Model direct original-reference re-shares (with owner-configured unlimited mode) vs independently published personal-version re-shares (per-hop grant).
- Track graph lineage, who granted whom access, independent paths and original ancestry; enforce no unauthorized redistribution.
- Gate: A->B->C->D and parallel A->B/C->D graph tests.

**P22 — Selective revocation and cache authorization**
- Owner can restrict a person, link or selected original-reference branch; block globally across routes only when explicit person-level block exists.
- Independent authorized personal versions/downstream publications survive ordinary original withdrawal; other valid access routes still work.
- On verified reconnect, revoke temporary/pinned original caches when *no valid route* remains. Handle delayed revocation of offline devices honestly.
- Gate: graph branch, alternate path, person-wide block, legal exception and offline reconnect tests.

**P23 — Read-only/editor and protected online viewer**
- Implement reader/editing capabilities based on file ownership and the share's frozen permissions; restricted private saved View Only copies stay noneditable.
- Support native/web protected rendering and encrypted file access; disable normal download/print/export/file-share routes for no-export files (best-effort, not absolute DRM).
- Gate: API mutation and raw-download paths resist role, ID, parameter and client-tampering attempts.

**P24 — Temporary offline caching, pins, and manual cleanup**
- Automatically allow protected offline reading of authorized shared resources, including non-downloadable selective shares; protected caches are not independent copies.
- Keep Offline pins are device-local. Clear Cache removes *unpinned* temporary caches only; explicit unpin removes the relevant pinned local copy.
- Never auto-evict for space; do purge revoked shared cache after confirmed authorization reconciliation. Surface actual storage-full errors.
- Gate: offline after first load, cache clearing, unpin, quota failure, owner revocation and alternative path tests.

### Stage E — Delta history, recovery, folder and export rules

**P25 — Incremental version-history engine [SEPARATE ENGINE SETUP]**
- Version DAG: content-addressed verified base, change sets, optional chunks, checkpoints, reference-safe GC and copy-on-write.
- Preserve logical separate identities despite physical dedup; no cross-account content-existence leakage. Keep surviving versions reconstructable offline, including after publisher revocation.
- User selects history retention; protect unresolved branches from automatic pruning; no age-based cleanup without authorized retention preference.
- Gate: deterministic reconstruct/restore; malformed/missing base, dedup collision and version deletion tests.

**P26 — Offline conflict resolution and history UI**
- Latest *reliably determined* actual edit wins; if unorderable, retain both incremental branches, display **last confirmed common revision** in normal editor and expose branch comparison/restore through history on demand.
- No sync-conflict popup; do not override either branch with new edits until their treatment is specified.
- Gate: simultaneous edits, skewed clocks, last-common-ancestor display and unresolved-retention-limit tests.

**P27 — Trash, empty-folder rules, permanent delete and recovery**
- Implement 30-day Trash, restore, confirmation-based permanent delete, expiry, trashed-item offline-edit restore and genuine deleted-note offline recovery as *new* note.
- **Nonempty folder deletion is blocked until student deliberately moves contents elsewhere** (including nested items). Move preserves file ID, history, chapter links; maintain ordering/transaction safety.
- Explicitly authorized legal/security prohibition takes precedence over recovery; ordinary deletion alone does not suppress it.
- Gate: nested folders, offline move failure, expiry race, duplicate recovered notes, legal hold and independent chapter links.

**P28 — Export/backup restrictions and restore**
- Audit existing `lib/exports/`, `app/api/exports/backup` and all share/download endpoints against inherited no-export restriction.
- Export Local Backup includes only content entitled to export; **exclude protected file bytes, encrypted packages, recoverable deltas/previews and keys**. Explain excluded material before export; do not claim full recovery where unavailable.
- Validate backup import identity, idempotency and entitlements; do not weaken already-established export feature gates.
- Gate: export/backup tar payload inspection, restore tests and simulated attempts to reconstruct restricted files.

### Stage F — Account security, operator controls

**P29 — Device registry, revoke and remote wipe [SEPARATE SECURITY SETUP]**
- Secure authenticated device IDs and sessions; device-revoke, Sign Out Everywhere, target-specific queued wipe commands, signed revocation-command polls that do **not** restore normal server privileges.
- Warn initiating user that unsynced device-only data may be lost. Wipe immediately after verified command receipt, without pending upload/backup; do not report wipe complete until acknowledgement.
- Gate: spoofed-device/replay attempts, offline reconnection, unsynced queue wipe and cross-user isolation.

**P30 — Admin controls, diagnostics, retention and audit**
- Admin can inspect immutable source policy, share provenance and authorized revocation/audit events; cannot mutate published content or privately owned files by bypass.
- Internal monitors for failed uploads, orphan blobs, retention/backfill integrity, wipe commands, denied downloads and share-graph consistency; avoid student-facing routine sync UI.
- Gate: admin-role escalation/security review, incident evidence and operational dashboard acceptance.

### Stage G — Integration, mobile QA and production rollout

**P31 — Full contract, security and resilience certification**
- Add CI tests for every scenario: D1/R2/auth/crypto/keys/file export; browser offline queues; cross-device concurrent editing; share/permission graph; secure revocation/wipe; owner restrictions; Trash/folder guards.
- Run fault injection: packet loss, corrupted chunks, skewed clocks, quota exhaustion, server restart, duplicate events, stale clients, Android process kill, data migration and no-export adversarial tests.
- Gate: zero unresolved P0 data-loss or unauthorized file access issues; acceptance checklist signed.

**P32 — Web + APK UX/performance certification**
- Measure offline launch, warm navigation, save-to-local latency, encrypted PDF open/seek, incremental revision restore, offline queue pressure, memory usage, APK size and 360–430px mobile layouts.
- Keep navigation/screen assets packaged and local in the APK; avoid network-dependent initial UI. Tune rendering and background work against repeatable baseline measurements.
- Gate: release/test APK installs and opens offline, browser works as designed within PWA limitations, user-flow/parity and accessibility tests pass.

**P33 — Controlled release, backfill and monitoring**
- Backfill older content and permissions without exposing restricted bytes, rolling out to test accounts -> opt-in/staff -> controlled users -> full production only after feature-by-feature gate approval.
- Deploy private targets and schema before dependent web features; maintain tested rollback path, old queue migration, audit logs, production monitoring and recovery playbooks.
- Gate: verified stable live behavior, protected export tests, no data corruption, documented rollback and final decision-to-code traceability.

## 4. Setup tracks requiring their own separate verification

| Track | Setup phases | Separate sign-off required |
|---|---|---|
| D1 file/metadata schema | P04 | Constraints, migration/backfill, versioning |
| R2 object model | P05 | Buckets/prefixes, signed URL audit, object lifecycle |
| Cryptography/key service | P06–P08 | Threat model, secret/key provisioning, protected viewer delivery |
| Safe validation and resumable uploads | P09–P10 | Content inspection policy, recoverable transfer protocol |
| Storage/quota accounting | P11 | Logical-vs-physical accounting and entitlements |
| Browser offline | P12 | IndexedDB migration and service worker |
| Native Android APK | P13–P15 | Project, SDK, signing, native encrypted store, OS jobs and build pipeline |
| Sync & multi-device | P16–P18 | Receipts, retry, clocks, dependency graph, multi-device proof |
| Sharing and encrypted view | P19–P24 | Snapshot isolation, permissions, graph/revocation, offline pin/cache |
| Delta/history engine | P25–P26 | Base/patch/checkpoint schema, editor history and conflict resolution |
| Deletion and backup | P27–P28 | Trash/relocation and inherited no-export across all export paths |
| Device security | P29 | Device identity, command delivery, remote wipe, acknowledgement |
| Admin + production safety | P30–P33 | Audits, adversarial tests, native QA, rollout/rollback |

## 5. Traceability by prior decision

- S0-001–S0-005, S0-008, S0-CONFLICT-006, S0-CONFLICT-010 -> P02, P04, P16–P17, P27.
- S0-006–S0-007, S0-CONFLICT-005, S0-CONFLICT-011, S0-SECURITY-003 -> P16, P25–P26.
- S0-009–S0-013, S0-SYNC-UI-001, S0-SECURITY-004 -> P12–P18, P31.
- S0-014–S0-015, S0-017–S0-026, S0-CONFLICT-001–002, 004, 008–009 -> P02, P06–P08, P19–P24, P28.
- S0-016, S0-SECURITY-001 -> P07, P14–P15, P29.
- S0-027–S0-031, S0-CONFLICT-003, S0-CONFLICT-007 -> P12, P14, P18, P22, P24.
- S0-032–S0-034, S0-STORAGE-INCREMENTAL-001 -> P04–P05, P10–P11, P16–P18, P25.
- S0-035–S0-036 -> P02, P25, P27.
- S0-037=C (pending register commit) -> P00/P09.
- S0-SECURITY-002 -> P08, P23, P28.

## 6. Mandatory tests and deliverables for every phase

For each phase:
1. Start with read-only **gap inventory** and a dependency check; do not accidentally overwrite functioning features.
2. Additive code/migrations under controlled flags; preserve schema/data provenance and reject dangerous unknown states.
3. Automated tests for policy, permission denial, offline behavior, migration, rollback and at least one negative/adversarial case.
4. Record exact files changed, commits, test logs, reproducible failure proof and remaining limitations in a phase closure note.
5. Merge after CI gates; deploy **only when stage-specific safety/rollout prerequisites pass** and verify on real staging/production target. A GitHub push alone is not deployment proof.

## 7. Important unresolved design issues (do not silently assume)

- Editor behavior if a student makes *another* edit while an unresolved multi-device conflict still shows the last confirmed common version.
- How local-only protected copies and read-only student-owned copies interact with backup/restore and encrypted key recovery across devices.
- Exact retention-control options and when old revisions are eligible for cleanup after explicit student resolution; per-plan logical storage accounting must agree with the existing entitlement system.
- Detailed legal takedown authorization, appeals, notifications and remote-wipe platform limitations.
- Current mobile source/build pipeline and the feasible native Android offline vault approach must be confirmed in P01/P13.
- “Encrypted content works only in CA Progress” is a **best-effort authorization/DRM boundary**, never a cryptographic guarantee against an adversarial authorized client.
- An independent user's valid private copy must remain reconstructable after upstream source revocation without accidentally extending original-source access.

## 8. Recommended delivery milestones

- **M1 Foundation approved:** P00–P03. All policies, inventories, constraints and rollout flags finalized.
- **M2 Secure backend ready:** P04–P11. File metadata, R2 isolation, encryption, upload validation/resume and quotas validated.
- **M3 True offline stack ready:** P12–P18. Web plus native encrypted local stores, durable synchronization and multi-device reliability.
- **M4 Sharing protections ready:** P19–P24. Immutable publication, permission matrix, share graphs, revocation, protected viewer and local-only pins.
- **M5 File lifecycle ready:** P25–P28. Deltas/history, conflict UX, Trash/folder guards, safe backups.
- **M6 Security and operations ready:** P29–P30. Device wipe, admin audit and monitoring.
- **M7 Production-certified:** P31–P33. Test proof, offline APK UX, staged release and rollback.

**Start with P00, then P01.** Do not rush to encrypted viewer development before canonical permission, provenance and key-lifecycle contracts are approved. Do not claim the APK is truly offline-first until native launch/storage/restart/reconnect are validated.
