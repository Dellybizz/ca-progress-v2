# Editor repair Phase 1 — performance and control reliability

## Scope

Repair the existing editor before adding the direct-manipulation interactions planned for Phases 2–3. Existing saved documents and schema remain compatible.

## Findings and changes

- Every edit previously called `getJSON()` immediately and queued a full IndexedDB draft. Coalesce local snapshots after 150 ms of idle time, with a 1,000 ms deadline during continuous typing. Manual/cloud saves still persist before sending. Visibility changes, pagehide and editor cleanup request a local flush; the unsaved-edit unload guard remains. An abrupt process termination can still lose the most recent uncheckpointed interval (up to one second); lifecycle events cannot guarantee asynchronous disk completion.
- Financial table normalization previously converted and checked every financial table after unrelated edits. Preserve ProseMirror structural sharing: skip tables whose node objects are unchanged from the previous document. Changed/new tables still normalize row/column identities, numeric cells and total-staleness metadata.
- Word counts and outline construction ran on cursor-only transactions. Cache document-derived statistics by document identity; selection length remains current.
- Table buttons previously allowed unavailable commands to silently return false. Capability-aware disabled states now explain unavailable actions, including splitting an unmerged cell or merging without a compatible selection. Existing row/column commands remain accessible.

## Benchmark

Same local headless Chromium runtime, same fixture: 20 balance-sheet tables interleaved with long paragraphs; 60 synchronous insert transactions at the beginning of the document. These measure editor command execution, not physical-device input-to-paint latency.

| Measurement | Before | Final local run |
|---|---:|---:|
| Median edit | 6.2 ms | 1.7 ms |
| 95th percentile edit | 12.6 ms | 3.1 ms |
| Full snapshots for 60-edit burst | 60 | 1 |

The repeatable `scripts/notes/performance-check.mjs` checks burst coalescing, continuous-typing checkpoints, exact latest-document flush on page hiding, insertion/undo of a row and available/disabled table controls. CI gates behavior rather than machine-dependent timing.

## Verification

- 1,433 automated tests pass; TypeScript, ESLint and production build pass.
- Browser regression covers financial figures/precision/format settings, row/column edits, explicit totals and recalculation, chart data and styling, object resize/undo/reorder, ink tools, mixed-content save, failed-save recovery, offline recovery and legacy RTL/merged-table import.
- Six widths: 320, 390, 768, 820, 1024 and 1440 pixels. Final-run status and deployment evidence are recorded separately.

## Boundaries

This repair does not implement the new in-page chart grids, edge insertion handles or hierarchy child/sibling controls. Those remain Phases 2–3. The general report that functions fail was not reproduced as a universal command failure; the concrete control defect repaired here is actionable-looking buttons for unavailable table commands. Browser coverage cannot certify physical Android keyboard, stylus/palm behavior or low-end-device latency.
