# Phase 0 — Engineering baseline and foundation complete

Date: 14 October 2026. Delivery plan: [eight phases](../PHASED_IMPLEMENTATION_8_PHASES.md).

**Completed:** reproducible source-behaviour baseline, read-only live UI inspection, editor model evaluation, candidate/license inventory, all 65 audit entries mapped to eight delivery phases, canonical contracts, and additive migration/rollback design. No application feature, production migration or native package was released in this phase. Device/render/input and production-access tests remain gates for their implementation phases; they are not silently marked passed.

## Verified baseline

| Check | Result / evidence |
|---|---|
| Audited source | Local baseline `3bce0be2`; feature remote `aa5c08f7796345ad26a9566af545d292ee4f05a4`; both tree `cbadb546aae6619ee32bed2664cee36846bdd851` |
| Live web | Public `/api/app-config` returned HTTP 200 and deployed SHA `b7325c2e916da5ec8e1b496afed9594797a5e2b2`; this is the application baseline before documentation-only changes |
| Live My files | Signed-in selected academic context displayed 0 items, subject filter cards, layout controls, sort/group/filter controls and empty state. No user records were created or changed. |
| Live note dialog | Basic formatting/table/metadata controls, Private default and manual Create action present; opened/closed without saving |
| Live ICAI tab | Displayed 0 items for the selected academic context. This does not prove the entire official catalogue is empty; catalogue/filter applicability needs investigation in Phase 1. |
| Existing tests | `npm test`: 1,307 passed, zero failed/skipped; baseline run about 7.8 seconds on this host |
| TypeScript | `npm run typecheck`: passed |
| Browser offline route | Actual `snapshotKind('/api/notes')` returns `notes`; versioned path returns undefined. Source mismatch confirmed; deployed build-time flag remains unknown. |
| Library scale | Mock-D1 execution of the actual query function with 1,001 available rows per collection returned 250/250/150/150; no cursor in its model. This is source execution with simulated SQL limits, not production D1 load testing. |
| HTML limit | Actual sanitizer returned 200,000 characters from 200,019 input characters and lost the trailing sentinel; plain-text helper returned 120,000 from 120,001. |
| Upload validation | Legacy helper rejected a fake PDF signature. Direct-completion source does not call that helper. No live unsafe file was uploaded. |
| Native provenance | Existing authoritative source is `apps/mobile` plus `android`; native assets currently 546,097 JS bytes / 89,941 CSS bytes. No new APK built. |
| Existing native workflow | [Run 38592520214](https://github.com/Dellybizz/ca-progress-v2/actions/runs/38592520214), “Onboarding Phase 7 APK certification,” succeeded at `b7325c2e…`. This certifies that workflow's existing scope, not the future notes engine/stylus or physical-device behaviour. |
| Migration ceiling | Audited `0094_onboarding_setup_v2.sql`; reserve later numbering only after fresh implementation checks |

Machine-readable evidence: [current system](current-system-baseline.json), [editor benchmark](editor-model-benchmark.json), [requirements matrix](capability-matrix.json).

## Editor decision

**Select Tiptap/ProseMirror for Phase 3 implementation**, using only approved OSS components initially and our own persistence/history/authorization contracts. This is an implementation choice, not production device certification. Lexical remains a viable fallback if actual WebView/IME/accessibility integration fails the gates.

| Candidate | Evaluation configuration | Minified core-probe bytes | Gzip core-probe bytes |
|---|---|---:|---:|
| Tiptap 3.32.0 | StarterKit, table, task list/item, explicit legacy adapters | 434,444 | 137,402 |
| Lexical 0.52.0 | Rich-text, list, table, link and HTML nodes | 441,971 | 144,124 |

Probe sizes exclude React controls, our small legacy adapters, ink/PDF engines, collaboration and application code. The configurations are not equivalent complete applications. Do not project these measurements directly onto Worker compressed bundle limits or full APK size.

Both candidates retained fixture text and tested semantics across rich HTML, mixed English/Hindi/Urdu/Arabic/emoji, a 1,000-paragraph document and merged-cell tables. All eight canonical JSON round-trip cases passed. We checked selected text sentinels, heading/table counts, highlights/underline, table spans and explicit RTL; this is not exhaustive fidelity certification.

Important discoveries from the initial run:

- Tiptap StarterKit alone omitted legacy `<mark>` highlights and explicit direction attributes. The evaluated adapter configuration preserves both. They must be present in the production importer; do not assume the base package covers our schema.
- A trailing empty paragraph may be introduced after terminal tables. One-time canonicalization is recorded explicitly, then subsequent JSON round trips must stabilize. The migration keeps the original HTML separately.
- Lexical's tested nodes retained those formats without the same adapters. Both engines are capable; the choice favors Tiptap's transaction/extension model and configured table/task foundation for this project's planned editor.
- Recorded import/serialization timings are **not a typing-performance competition**: the Tiptap setup creates a view while Lexical uses a headless editor. JSDOM does not measure layout, paint, input latency, composition or pen interaction. Raw timings are retained only as host-specific diagnostics.

Direct evaluation dependencies report MIT licenses in the installed manifests. Paid/hosted pagination, conversions, tracked changes, comments, history or AI services are not approved or assumed included. A complete transitive license review is still required when actual production dependencies are added. This isolated package is not imported by Next.js or the native bundle.

References checked: [Tiptap React setup](https://tiptap.dev/docs/editor/getting-started/install/react), [persistence](https://tiptap.dev/docs/editor/core-concepts/persistence), [Lexical React setup](https://lexical.dev/docs/getting-started/react). Selected pinned package versions are captured in the evaluation lockfile rather than left as `latest`.

## Contracts and migration decisions

- Structured JSON is canonical for new typed documents; HTML remains a derivative/legacy input. Stable IDs join folder/notebook organization, academic labels, attachments, source lineage and revision graph.
- Ink and PDF annotations use separate page/object layers; no full raster/base64 document row.
- Server permission evaluation controls original/copy/edit/export/cache rights. Existing published-original, no-export and View Only policies are preserved.
- Durable local receipt precedes cloud acknowledgement. Reliable actual edit ordering follows approved policy; uncertain branches retain both and common revision. Routine synchronization remains invisible.
- Schema migration is additive; legacy IDs/content/queues are retained. Older clients cannot flatten new-format documents. Rollback disables feature exposure and preserves new data for repair.

Details: [workspace contracts](WORKSPACE_CONTRACTS.md), [migration and rollback](MIGRATION_AND_ROLLBACK.md).

## Open verification gates, assigned rather than claimed complete

| Gate | Required phase |
|---|---|
| Deployed offline build flag, authoritative D1/R2 environment and storage entitlement values | Phase 1 pre-deploy baseline; do not infer from historic staging bucket names |
| Restore drill against a production-like isolated copy; actual schema/queue migration tests | Phase 1 before rollout, expanded in Phase 4 |
| Real D1 cursor/search/load and processing sandbox/malware evidence | Phases 1–2 |
| Android WebView composition, screen readers, keyboard/selection/undo and full legacy corpus fidelity | Phase 3 before editor rollout |
| Crash/process-kill, local persistence, device clocks/conflicts and native OS jobs | Phase 4 |
| Physical stylus pressure, palm rejection, rotation, dense ink/PDF memory | Phase 5 |
| Protected gateway, encryption/key lifecycle, share graph, export and revocation adversarial tests | Phase 6; required before restricted preview/processing |
| OCR/transcription/provider cost/privacy, collaborative merge and final device matrix | Phase 7 |

**Next: Phase 1**, starting with note route normalization and explicit size/save preservation, then real folder/search/recovery work. This phase does not alter billing prices, onboarding or existing student data.

## Reproduce

From repository root with its dependencies installed:

```sh
node scripts/resources/phase0-baseline.mjs
npm ci --prefix tools/resources-editor-spike --ignore-scripts --no-audit --no-fund
npm run benchmark --prefix tools/resources-editor-spike
npm test
npm run typecheck
```

The first two evaluation scripts write timestamped observations into this folder. They use fixtures and local modules, not production credentials or user records. Timing output varies by machine. Baseline characterization records current faults and should not become a regression assertion that those faults must remain after Phase 1.
