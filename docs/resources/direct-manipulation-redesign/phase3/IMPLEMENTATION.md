# Phase 3 — direct accounting workings

Scope: newly inserted journals, balance sheets, profit-and-loss statements and ledger accounts. Existing notes retain their structure and entered figures. Other catalogue families remain for Phase 4.

## Behavior

- Row gutter controls insert immediately above/below the hovered or focused row, including totals. Column controls insert before/after the selected column. Rename cells directly; resize native column boundaries or specify widths. The existing controls retain colour, border, height, row/column ordering and undo.
- New templates start in Manual mode. Assisted totals are an explicit choice. Switching to Manual retains figures and total definitions. Editing an assisted total directly makes that entire total row manual, retaining its current figures; it cannot silently become a formula again.
- Section membership is identity based, independent of row position. A line inserted immediately before a section total joins its group. A line after a total stays outside the preceding group. Arrange exposes group membership and Add/Less signs. Section headings and working-note rows are excluded. A new section receives its own identity; insert a group total with Arrange. Explicit selected-row subtotals retain their source/column choices.
- P&L has separate income and expense groups and an explicit expense total. Profit before/after tax references the relevant totals once, avoiding double counting. Balance-sheet assets and liabilities use distinct groups. Journal figures are manual until a total is explicitly added; narration is never parsed as a formula.
- New horizontal balance sheets, P&L T-accounts and ledger T-accounts contain two real tables. Each side has independent rows, columns and scoped totals. On narrow screens the sides stack; print/export retains side-by-side accounts. Ledger balancing figures remain manual; this phase does not automatically infer a balancing transfer.
- Column purposes distinguish particulars, references, dates, final amounts, analysis amounts, numbers, percentages and text. Particulars receive more space; L.F./references receive less. Widths stay fixed while typing. Fit widths is an explicit operation. New analysis/amount columns receive their own group totals in Assisted mode.
- My formats captures and inserts a complete paired account, including blank-figure reuse, without nesting it inside a side.

## Compatibility and implementation

`account` is a bounded block containing exactly two financial tables. `caSection`, `caSign` and validated `caTotal` definitions express row intent; `caColRole` expresses width/type intent. Financial config `workings:1` identifies semantic templates. Formula `scope` resolves current group membership dynamically; existing explicit formula terms remain supported. Exact six-place decimal arithmetic is unchanged. Only known stock template positions receive total definitions; custom labels and old notes are never classified by guessing words such as “Total”.

Live recalculation patches changed cells instead of replacing the entire table, preserving the caret while source figures are typed. Immutable unchanged tables retain the existing fast path. Paired-account controls sit outside both table grids so selecting a side cannot misalign the other side. Controls are excluded from print/export. Existing source errors remain visible rather than silently becoming zero.

The save payload includes `accounting-workings-v1` alongside the hierarchy capability. The API refuses an older client saving an existing semantic accounting note with `NOTE_EDITOR_REQUIRED`; stored data remains unchanged. This capability travels with queued offline mutations.

## Verification

- Nine new model tests cover manual/assisted figures, boundary membership, signed scoped sums, net calculations, analysis columns, widths, independent sides, safe validation and older-client refusal.
- `scripts/notes/accounting-check.mjs` exercises actual editor typing/caret retention, boundary insertion, automatic totals, manual override, column insertion/undo, reopening, independent sides, touch selection, reusable paired accounts, normal save capabilities and viewport bounds at 320, 390, 768, 820, 1024 and 1440 px. Included in the Resources release workflow.
- Existing financial, whole-editor, paste/reuse/print and performance checks remain required. Production fixture additionally saves asymmetric paired sides and scoped formulas, compares exact D1 JSON, checks safe account HTML and refuses a client lacking accounting capability.

Physical Android/WebView and iOS Safari validation remains part of Phase 5; headless touch simulation is not hardware certification.
