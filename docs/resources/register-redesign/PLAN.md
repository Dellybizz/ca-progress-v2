# Register and interaction redesign

This sequence follows the 18 October 2026 request for a register-like Notes editor. It is separate from the earlier direct-manipulation phases. Preserve previous accounting, hierarchy, working-note, save/export and security behaviour throughout.

| Phase | Scope | Completion gate |
| --- | --- | --- |
| 1 | Facing portrait A4 sheets, selected landscape sheet, real page flow, page navigation/zoom, ruling and per-page paper settings | Compatibility, long text/tables, explicit breaks, safe settings, save/reopen and print; Chromium + WebKit; verified deployment |
| 2 | Consistent selection, corner/edge resizing, column boundaries, drag grips, alignment guides, touch movement, cancel and single-step undo | Mouse/touch/keyboard checks at multiple zoom levels; scrolling and typing remain usable |
| 3 | Editor-owned contextual right-click/long-press menus; copy a parent with its whole subsidiary branch | Relevant actions, clipboard constraints, fresh IDs, preserved styling/relative geometry, independent copies and undo |
| 4 | Joined debit/credit sides without internal gutters; role-based column widths; consistent bracketed-negative input | Independent account sides stay editable; typing/paste/import/recalculation produce identical exact totals |
| 5 | Coordinated appearance presets; cleaner element menus and visual format selector; general visual refinement | Live preview, clear application scopes, advanced colour overrides, mobile sheets, favourites/recent/personal formats |
| 6 | Full interaction, persistence, export, performance and accessibility certification | Complete student workflows; existing-note compatibility; physical-device and offline APK gates reported separately |

Phase 1 implementation and release evidence: [phase1/IMPLEMENTATION.md](phase1/IMPLEMENTATION.md) and [phase1/RELEASE.md](phase1/RELEASE.md).

Key interpretation: orientation is a document paper setting. Portrait uses a facing spread where space allows; smaller screens focus one readable page. Landscape focuses one selected sheet. New notes use register view; existing notes retain their saved view until changed. Page-specific paper follows the page number after reflow.

Phase 2 should address phone row/column touch dragging explicitly. Current phone layouts retain accessible move buttons; native HTML row/column dragging is certified on desktop. Keep one canonical document and avoid saving pointer previews or zoom/navigation as content edits.

Known baseline findings: account CSS includes both a 16px gap and authoring gutters; hierarchy duplication currently copies an element rather than all descendants; the exact amount parser already supports bracketed negatives, so Phase 4 must audit consistency across entry paths rather than add a second parser.

Physical Android/iOS testing and full rich editing in the offline APK remain open under the earlier certification record. Do not imply device parity from headless browser checks.
