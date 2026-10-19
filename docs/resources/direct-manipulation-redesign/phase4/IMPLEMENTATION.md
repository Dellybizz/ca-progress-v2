# Phase 4 — complete catalogue and linked personal workings

## Scope and behavior

All 24 accounting families / 71 variants now use the semantic editor introduced in Phase 3. The six chart/graph families retain their existing direct controls. Existing notes are not reinterpreted or migrated; newly inserted templates start in Manual mode.

- Trading, cash books, partnership, branch, investment-account, not-for-profit and revaluation layouts use independent Dr./Cr. tables. Partner accounts have separate editable partner amount columns. Investment accounts have nominal/income/capital columns; investment registers have units and rates. Cash books retain distinct one/two/three amount-column layouts. Memorandum revaluation separates first-part and reversal totals.
- Departmental accounts have editable department columns, an independently written total column and allocation explanations. Petty cash distinguishes simple and analytical layouts. Depreciation has asset/date/method/rate roles. Ratios preserve written numerator/denominator formulas and commentary. Variance has F/A and explanation fields. Production budgets use units rather than money.
- Consolidation variants have different acquisition/NCI/reserve/pre-post workings. Bank variants distinguish cash-book, pass-book and adjusted-cash-book starting points. Individual/company/reconciliation tax workings have different scaffolds. Context, explanations and manual result bands are excluded from group sums.
- Known stock layouts carry explicit formulas for trial-balance and depreciation column totals, cost-sheet stages, vertical trading results, cash-flow groups/net movement, department results and production/flexible budgets. Cost per unit and quantity fields are never summed as money. Manual balancing figures, tax rules, ratios, ownership calculations and cross-column department totals remain writable; no tax rates, regulatory rules or automatic accounting inference are embedded.
- Every family receives appropriate initial widths and direct row/column boundary controls. Manual widths and entered figures survive edits. Custom row labels are never guessed into totals.

## Linked working notes

Use W.N. beside a table or Insert → Working note. Create a supporting working at the end of the document, or reference an existing one from text/particulars/reference cells. A working accepts ordinary writing, formats, tables and charts. A reference cannot be inserted into a numeric amount cell.

The `workingNote` block stores a stable block identity, derived number and bounded return-link anchors. Inline references store `workingTarget`, href and their own stable anchor. A lightweight editor plugin numbers workings in document order and updates labels/backlinks, without replacing document content. Reordering preserves relationships; deleted targets show “Missing working note”. Clicking a reference or return link navigates inside the editor. Export independently regenerates numbering/backlinks from actual identities, and escapes all labels. Working notes remain distinct from Notes to Accounts.

`linked-working-notes-v1` is carried in normal and offline save bodies. The API refuses an older client updating a note containing linked workings, preserving stored data. No D1 migration is needed.

## Personal formats

My formats captures the selected table/account/chart plus the transitive closure of its linked workings, excluding unrelated document content. Missing links produce a repair message. Copies receive fresh block/reference/working IDs, remap links and regenerate backlinks. Blank figure reuse preserves working references and labels. Formats can be duplicated and inserted with an explicit blank-figures option.

Export my formats downloads a bounded JSON bundle. Import adds validated formats atomically, gives them fresh saved-format IDs, disambiguates name collisions and never replaces existing formats. Invalid, oversized, resource-bound or over-quota imports make no storage changes. Export includes stored figures. Personal format collections remain scoped to the signed-in account/context on the device; import/export provides explicit transfer between devices, not automatic cloud synchronization. Inserted copies and their working notes save normally with the note.

## Verification

Eleven new model tests cover every accounting variant and assisted definition, independent family layouts, quantities/rates, exact cost stages, memorandum scopes, numbering/reordering/deletion, safe export, compatibility, linked capture, independent blank copies and atomic portable imports.

`scripts/notes/catalogue-working-check.mjs` runs at 320, 390, 768, 820, 1024 and 1440 px. It loads all accounting variants into the real editor, edits new paired families independently, creates/navigates/reorders linked workings, inserts a cost sheet inside a working, copies/exports/imports personal formats, verifies persistence capabilities and produces portrait/landscape print output. The release workflow runs it alongside all existing browser suites. Production verification adds exact D1 and HTML/reload checks for working targets and return links, and older-client refusal.

Physical Android/WebView and iOS Safari certification and broader user-task validation remain Phase 5. Catalogue coverage is not certification of ICAI compliance or tax computation correctness.
