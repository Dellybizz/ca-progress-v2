# File manager polish Phase 0 — reliability baseline

Status: **complete — baseline and live reliability gate passed**, 15 October 2026. This is FMP-00 of the file-manager polish plan, not the earlier Resources Phase 0. Next feature phases remain paused.

## What was implemented

- A repeatable benchmark that imports the actual `listWorkspace` production module and applies all retained migrations to isolated local SQLite. It measures mixed file/note libraries at 0, 24, 1,000, 10,000 and 100,000 records, with 1,000 folders at the larger sizes. It records query plans, query count, response bytes, warm samples and process RSS.
- Ownership and full-text-tail assertions at every size; full cursor traversal of all 1,000 owned records without duplicates. The 100,000-record profile is a measured first/search/nested-page workload, not a claim of exhaustive traversal at that size.
- A narrowly scoped historical fixture-object audit. It identifies only the disabled manual test account created during the failed upload certification window, 15 October 2026 03:06–03:07 UTC. It refuses ambiguous accounts. An object can be removed only if its owner/path/name, exact 12 MiB + 123 byte size and full SHA-256 match the synthetic fixture, it has no database references, and the current object and account still match immediately before deletion. Deletion is verified with an R2 head check.
- Actual SQL guard checks preserve referenced resources, upload intents, test attachments, test attachment intents, inspections and cleanup-journal objects; exclude active, non-test and out-of-window accounts; and validate dry-run, content mismatch, object change and failed deletion behavior.
- An isolated loopback audit runner uses Cloudflare remote D1/R2 bindings. It does not add a production HTTP route, deploy a new public maintenance endpoint, or sweep real users' objects. Runtime credentials stay in memory/private temporary configuration and are not logged.
- A dedicated CI workflow runs the existing reliability suite, guard checks, actual query benchmark, live schema/authentication probes, the fixture audit, and a normal signed-in three-part upload/download roundtrip. Non-secret JSON evidence is retained as an artifact.

## Local measurements

These numbers measure real application SQL on local in-memory SQLite, not Cloudflare D1/network latency or browser interaction. Each workload has one warmup and nine samples; the reported sample p95 is the maximum of those nine observations and is not a statistically established production SLO.

Runtime: v24.19.0; CPU: AMD EPYC 9V74 80-Core Processor. Source commit for this local run: `a1e81f5d04dcb95e2ec1bddd75a3dd026cdd4d9b`.

| Owned records | Owned folders | First-page median | First-page sample p95 | Queries/request | First-page JSON |
|---|---|---|---|---|---|
| 0 | 0 | 1.05 ms | 1.24 ms | 4 | 81 B |
| 24 | 0 | 1.25 ms | 1.5 ms | 4 | 12,062 B |
| 1,000 | 0 | 7.81 ms | 8.84 ms | 4 | 49,137 B |
| 10,000 | 1,000 | 70.49 ms | 87.58 ms | 4 | 137,124 B |
| 100,000 | 1,000 | 566.35 ms | 633.53 ms | 4 | 137,129 B |

The detailed evidence includes full-text-tail search, nested-folder results and query plans. The previous isolated FTS prototype remains useful as a prototype but is not used to substantiate this file-manager baseline.

## Findings carried into later polish packages

1. Every workspace query fetches all owned folders. With 1,000 folders, even an empty nested-folder response carries about 90 KB of metadata. FMP-02/FMP-07 should introduce bounded folder children/path queries.
2. A workspace page performs four database operations: folders, revision, total count and page. Query plans and repeated scans must be evaluated before claiming a production p95 target.
3. Local first-page cost grows with library size. Preserve the baseline and compare the same fixtures after optimization; do not infer production speed from the small isolated FTS timing.
4. Browser usability, global transfer persistence, selection/menu behavior, non-modal details, accessibility and real-user performance remain later package work. Passing this reliability baseline does not mean the 104-case polish matrix is complete.
5. Existing folder-deletion policy remains **move the contents elsewhere first, then delete the empty folder**. No recursive folder deletion is authorized by a generic polish request.

## Reliability invariants

Keep private unclassified upload defaults; actual byte progress versus Saving/Saved state; per-part/full hash verification; owner checks; quota reservations; completion claims; expanded receipt compatibility; exact signed GET delivery; retained originals after metadata failure; and additive migrations with foreign-key checks. No schema migration or user-data transformation is added by this baseline.

## Evidence and outcome

- [Successful Phase 0 workflow 38778420574](https://github.com/Dellybizz/ca-progress-v2/actions/runs/38778420574), job `116572704477`, final harness source `476cdb83e1df4b8762a2ff2b4f29b47ad6524a86`.
- Existing suite: 1,371 tests pass, zero failures. Cleanup guard checks and all actual-query profiles pass in CI.
- Live runtime inspected: `aa07463d1544ba6a19af6aa0d364e4ab088ac087`. Schema ledger 0095–0098 present, zero foreign-key violations, binary/native upload authentication probes pass and ordinary JSON size protection remains enforced.
- One historical disabled manual-test account was uniquely identified. Its exact `files/{fixture-owner}/` prefix contained **zero objects** in both inventories. No historical object was deleted by this run; there were no retained/unverified objects in that prefix. This resolves the earlier cleanup uncertainty without a general bucket sweep.
- Fresh normal signed-in 12 MiB + 123 byte, three-part upload: saved with null subject/chapter, completion retry idempotent, authenticated original download has the exact hash. Fresh fixture resources/bytes removed through the app's binding; fixture sessions revoked/account disabled.
- [CI live evidence](ci-live-baseline.json), [CI actual-query evidence](ci-workspace-baseline.json), [local baseline](workspace-baseline.json). CI ZIP artifact `11995086704` was downloaded and verified against SHA-256 `6cfe6785e2611a3d085169b1c93d054ab862dca748a8d34d499e7a1bc954eb60` before importing the two expected JSON reports.

The initial audit attempts failed in tooling before certifying the result. Diagnostics exposed a D1 rejection of the six-branch compound reference query. It was replaced by a single EXISTS-based reference check; actual SQL tests still protect all six referenced-object classes. These failed attempts are not counted as passing live checks.

Earlier upload foundation evidence is in [the verified repair record](../../phase2/UPLOAD_DATABASE_AND_SIDEBAR_REPAIR.md). Phase 0 adds verification/benchmark tools, not a redesigned UI or a new public maintenance API. The broader Resources release pipeline may rebuild the unchanged application as part of the branch's existing CI policy; it is not evidence that a new visual phase shipped.

## Next package

FMP-01 is ready: canonical state, action/capability contracts, navigation rules and design tokens. The remaining file-manager polish packages and the later typed-notes feature phase have not been implemented by this checkpoint.

## CI measurement cross-check

CI uses the same fixtures on AMD EPYC 7763 64-Core Processor / v22.23.3. These remain local SQLite numbers, not production D1 latency.

| Records | First-page median | First-page sample p95 | JSON bytes |
|---|---|---|---|
| 0 | 1.13 ms | 1.77 ms | 81 |
| 24 | 1.46 ms | 1.92 ms | 12,062 |
| 1,000 | 7.4 ms | 7.84 ms | 49,137 |
| 10,000 | 59.88 ms | 60.99 ms | 137,124 |
| 100,000 | 582.64 ms | 619.46 ms | 137,129 |
