# CA Progress: direct manipulation of study workings

Research and source audit: 18 October 2026. This is a design/audit deliverable, not an implementation or deployment claim.

## Evidence and audit boundary

Audited the current release branch at `d03b91780e8a253e5406c26ff021428d6ae13cc1`, including chart model/rendering, graph gestures, contextual object controls, financial controls/actions, catalogue, financial editor and structured document validation. The local checkout available during this audit was at an older Phase 2 commit; findings below use the fetched release source, not that stale checkout. This is a source and interaction-design audit, not a fresh signed-in physical-device test.

The catalogue has 30 formats and 82 named variants. Those counts describe catalogue coverage; they do not establish 82 independently validated CA study layouts. Published ICAI suggested answers provide evidence of solution structures, not a statistical survey of student preferences. Public student discussions about working-note placement are anecdotal and do not determine examination marking rules.

## What the request means

The primary editing surface must be the object under the pointer/finger. A template supplies an initial working; the student then shapes it directly. A hierarchy node, connector, row, column, subtotal and narration need different controls. An available command in a remote toolbar is not equivalent to an action visibly attached to the intended item.

Interpretation of hierarchy controls: side plus adds a sibling with the same parent; bottom plus adds a child. A sibling of a root is another root, unless the student explicitly inserts a common parent. This mapping stays semantically consistent; horizontal presentation must not silently change what the same button does. Labels/tooltips identify the relationship.

Free placement is proposed inside an expandable diagram canvas embedded in the note. The diagram block itself remains movable between note blocks. Moving individual nodes freely across unrelated text paragraphs would require a broader page-canvas model and should not be silently conflated with diagram placement.

## Current gaps

| Current release behavior | Why it misses the request |
|---|---|
| Child/sibling/parent actions live in a toolbar; node properties use selectors/panels | The student leaves the node to manipulate it; no hover-side/bottom plus affordances |
| Graph nodes store x/y but not width/height; SVG nodes use fixed 150 × 64 geometry | Resizing the diagram block cannot resize an individual element |
| No graph long-press timer or per-node pointer context menu | Tap/hold has no defined contextual behavior or arbitration against dragging |
| Connector endpoints use fixed node dimensions | Per-node resizing needs new bounds-aware attachment calculations |
| Node labels are split into fixed-length pieces and limited to four rendered lines | Short labels have excess space; long labels can be visually truncated |
| Table actions are attached to the table, with before-insertion behind Arrange | Missing exact boundary controls above/below a particular total and either side of a selected column |
| Default catalogue cells use colwidth:null | No semantic initial allocation for particulars, folios, dates and amounts |
| Catalogue body rows get identities but no semantic total/section metadata | Text reading “Total assets” is not automatically a semantic total or calculation |
| Calculated totals store explicit source row/column IDs; insertion adds a row without expanding source terms | A newly inserted row can be physically before a total yet excluded from it |
| Paired accounts use a shared physical row grid | Inserting on the debit side also changes the physical credit-side grid; independent side totals/entries need explicit modeling |
| Some variants change labels/rows while sharing generic structural machinery | Each family still needs checks for narration, analysis amounts, notes, partner/product columns, quantity/value and multi-level headings |
| Reusable formats are device-scoped | They retain a personal layout on that device, but do not yet provide a cross-device preference/template collection |

Keep the useful foundations: structured persistence, exact decimal amounts, stable identities, undo transactions, safe colors, legacy compatibility and separate export rendering.

## Hierarchy interaction specification

| Action/state | Desktop | Touch |
|---|---|---|
| Discover add controls | Hover node; also show on keyboard focus/selection | Tap node reveals side/bottom plus controls |
| Add sibling | Side plus, new sibling under same parent, immediately edit name | Tap the same plus |
| Add child | Bottom plus, create connected child in nearest free position, immediately edit name | Tap the same plus |
| Open node options | Left click on node body without dragging opens anchored contextual menu | Hold still about 500 ms opens compact contextual sheet/popover |
| Edit text | Double-click label, or Edit text action/F2 | Edit text action opens the keyboard; preserve ordinary selection inside text |
| Move | Pointer down/move on node body; menu does not open after drag | Touch/move starts dragging once movement exceeds a small threshold; cancel hold timer |
| Resize | Selected node shows corner/edge handles | Larger touch targets around selected node; allow numeric size alternative |
| Move branch | Explicit branch command/modifier; moving one node is the default | Explicit branch option, never an accidental consequence of a drag |
| Pan/zoom | Space/background drag or explicit canvas tools; pointer anchored zoom | Background movement pans the diagram; pinch zoom inside it; normal page scroll outside it |
| Undo/cancel | One completed move/resize is one undo step; Escape cancels preview | Pointer cancellation restores original model; releasing a long press leaves menu open |

Suggested starting thresholds: about 4 px for mouse drag and 6–10 px for touch movement, with a 450–500 ms hold. These are prototype tuning values, not certified universal settings. Resolve the gesture first; do not change the note on pointerdown. New-node placement should avoid immediate overlap without moving the whole existing map. Auto arrange is explicit and undoable; manual positions survive resizing, reopening and adding another node.

A selected/hovered node's controls must remain reachable when moving the pointer from the node to its plus buttons. The overlay should not affect document layout. Render controls at stable screen size across zoom, with approximately 44 px touch targets even when the visible icon is small. Menus flip/clamp to viewport, avoid the keyboard and are available through a visible selected-node menu button as an alternative to long press. Right click can optionally open the same menu; it must not replace the requested left-click behavior.

Node menu: Edit text, fill/border/text colors, shape, font size/alignment, fit to text/reset size, duplicate, add relationships, move branch, change parent, collapse if it has children, lock/unlock, delete. Show child/branch deletion as separate actions; never silently delete descendants. A connector menu exposes label, line/arrow/color/style and reconnect/delete, not node controls. A blank diagram area exposes add root, arrange, zoom/fit and canvas settings.

Relationships and coordinates must be separate. Dragging a child below a different parent does not reparent it unless an explicit reparent drop target is activated. Hierarchy parenting rejects cycles and multiple parents; general flowcharts can permit cycles and multiple incoming edges. Resize updates connector anchors immediately. Persist text, x/y, width/height and style independently for every node.

## Financial table interaction and total semantics

Show a small plus at the hovered/focused row boundary in the outer gutter, including immediately before and after every subtotal/total. Show column insertion plus controls at header boundaries. On touch, selecting a row/column exposes the same actions in a compact nearby menu. Row actions say Above/Below; column actions say Left/Right. Do not spread persistent icons across every cell.

Row menu: insert above/below, duplicate, move, delete, row type (item, adjustment, section, subtotal, total, narration, working note), indentation, borders and minimum height. Column menu: insert left/right, duplicate/move/delete, semantic role, number/percentage formatting, width/auto-fit/hide. A normal cell exposes text/number formatting and relevant fill/border; calculation-source actions belong to computed cells/totals. Merged or otherwise unsupported operations must be disabled with a specific reason, not allowed to corrupt structure.

Totals must not be hardcoded as the last row or column. P&L can contain total income, expenses, profit before tax, tax and profit after tax, with new adjustments between them. T-accounts can have totals followed by balance b/d. Multi-section workings can contain multiple subtotals and notes after a final total. New rows and columns are allowed in all those positions.

### Manual and assisted workings

Manual mode: the student supplies figures; total role controls presentation without silently adding a formula. Assisted mode: a total has an explicit scope and visible calculation membership. Keep fixed-source totals as an intentional option, but distinguish them from section totals that expand with new eligible rows.

| Insertion | Proposed assisted behavior |
|---|---|
| Item inside a section, immediately before its subtotal | Include in that section total, respecting sign and eligible amount columns |
| Adjustment below a subtotal | Outside the preceding subtotal; can feed a later net total |
| Narration/heading/working-note row | Never treated as a numeric contributor merely because it is nearby |
| New period/partner/product amount column | Create the corresponding calculation per applicable total, with its own identity |
| New folio/reference/note column | No automatic numeric aggregation |
| Move or remove a referenced item | Keep ID-based references; update scope deliberately or show a repairable missing-source state |
| Nested subtotal/grand total | Avoid counting both detail and its subtotal twice; show source groups |

Scope cannot be inferred only from the displayed word “Total”, row position or addition sign. Templates need semantic sections and total roles, with inspectable membership. Preserve the student's manual figures while adding this structure. Optional validation can flag a balance-sheet mismatch or debit/credit difference without blocking ordinary writing.

## Space allocation

Use semantic roles and measured content: flexible wide description, compact fixed/bounded reference/date, numeric columns sized for their actual amounts and labels. Save manual overrides and never auto-fit away a student's resize while typing. The figures below are proposed starting proportions, not ICAI-prescribed widths.

| Role | Starting behavior |
|---|---|
| Particulars, narration, explanation, audit response | Main share of remaining width; wrap and grow vertically |
| L.F./J.F./voucher/note number | Narrow, optionally hidden where not useful; roughly 5–8% in a conventional journal |
| Date | Compact, roughly 10–13% where included; format-aware |
| Amount, debit, credit, total | Smaller than particulars, typically 15–22% each in simple layouts; expand for large figures |
| Intermediate/analysis amount | Optional narrower numeric subcolumn before final amount |
| Rate, ratio, quantity, units, F/A | Compact, with explicit units/type instead of treating everything as money |
| Partner/year/department/product | Repeated consistent numeric widths; additional columns may require landscape/scroll |
| Dr./Cr. sides | Each side allocates its own particulars/amount widths and can contain different entry counts |

Example journal: Date 12%, Particulars 47%, L.F. 5%, Dr. 18%, Cr. 18%. Compact two-amount working: Particulars 64%, analysis 16%, final amount 20%. These are illustrations; 12-column schedules cannot retain all comfortable widths on a portrait phone. Use internal horizontal scrolling, landscape/page controls and actual print preview rather than shrinking all content to illegibility.

## CA study practices: evidence and design implications

ICAI Foundation January 2026 and Intermediate September 2025 papers instruct that working notes form part of answers. Foundation examples include numbered workings, assumptions, side-by-side accounts, partner columns, balances after totals and intermediate deductions beside final amounts. Intermediate examples include Notes to Accounts, W.N. references, company financial statements and supporting ledger accounts. Costing examples use material/unit/rate/quantity, multiple products/periods, repeated subtotals and total/per-unit results. These documented patterns support the following design requirements; they do not prove every student follows the same method.

- Main answer and working notes are separately named, linkable and reorderable. W.N. numbers and backlinks should survive insertion/reordering. Do not conflate working notes with Notes to Accounts.
- Allow an intermediate amount plus a final amount, Add/Less adjustment rows, brackets, lakh/crore/rupee units and Indian digit grouping.
- Support To/By, Dr./Cr., b/d and c/d; narration belongs with a journal entry, including entries spanning several lines.
- Allow date/folio/reference columns to be shown, hidden or resized for the student's working. This is a study preference, not a claim that an examination-required column may always be omitted.
- Foundation-style T layouts, company vertical formats, partner matrices and costing quantity/value formats need distinct structures, not one equal-column table.
- Preserve a student's sequence, abbreviations, row density, headings, indentation and highlighting. Save blank reusable workings with styles and relationships.
- Distinguish manual exam practice from assisted arithmetic. Keep assumptions/formulas/explanations writable. Provide hints/checks without silently solving or overwriting a student's attempt.

There is no representative user study behind these personalization recommendations. Validate them with a small sample of Foundation, Intermediate and Final students using actual study tasks before claiming broad preference or exam effectiveness. Public discussion snippets about putting workings before/after the main answer are anecdotal, not official guidance.

## Audit of the whole current catalogue

| Format | Variants | Main redesign requirement |
|---|---:|---|
| Balance sheet | 3 | Hierarchical sections, totals, notes references, analysis/final amounts; vertical, paired and comparative structures |
| Profit & loss | 3 | Multiple intermediate/net totals, Add/Less adjustments; flexible items after subtotals |
| Trading account | 2 | Independent Dr./Cr. entries, gross profit transfer and optional analysis amounts |
| Cash flow statement | 2 | Operating/investing/financing sections; method-specific rows already exist but need semantic subtotal scopes |
| Not-for-profit accounts | 2 | Distinct income/expenditure and receipts/payments presentation; opening/closing cash and separate sides where appropriate |
| Ledger account | 2 | T-account sides versus running balance; date/ref narrow, particulars wide, b/d below total |
| Journal entries | 4 | Group several debit/credit lines into an entry, narration spacing/indentation, optional reference display |
| Trial balance | 3 | Compact references, paired numeric columns, adjustment grouping and debit/credit check |
| Cash book | 3 | Paired sides, one/two/three amount columns, contra references and carry-forward positions |
| Petty cash book | 2 | Compact date/voucher, wide particulars, analytical expense columns and total bands |
| Partnership accounts | 4 | Multiple partner columns on each side, ratio changes, independent side entries and transfer rows |
| Branch accounts | 4 | Debtors/stock/adjustment distinctions, optional quantity/value/loading columns and side-specific totals |
| Departmental accounts | 3 | Repeated department columns, shared expense-allocation workings and total columns |
| Investment account | 3 | Nominal/income/capital subcolumns, purchase/sale sides, date/reference and cum/ex-interest workings |
| Revaluation/realisation | 3 | Side-specific adjustments and profit/loss transfers; memorandum working groups |
| Cost sheet | 3 | Cost stages, subtotal scope, total/unit costs and units/rates |
| Depreciation schedule | 3 | Asset descriptions, dates/rate/method, additions/disposals and numeric roll-forward |
| Bank reconciliation | 3 | Starting balance, Add/Less groups, signs and adjusted cash-book link |
| Consolidation workings | 4 | Separate goodwill/NCI/reserves/pre-post acquisition structures, ownership percentages and W.N. links |
| Ratio analysis | 2 | Numerator/denominator explanations, ratios/percentages and comparison periods |
| Budget | 3 | Cash/activity/production roles, period/quantity columns and opening/closing balances |
| Variance analysis | 4 | Standard/actual quantities/rates, formula explanations and F/A presentation |
| Tax computation | 3 | Reorderable addbacks/deductions, assessment-year context, manual computation and explanatory notes |
| Audit working paper | 3 | Predominantly wide text/evidence/conclusion columns; not amount-width defaults |
| Bar chart | 2 | Direct category/series selection, label/value editing, contextual color controls and legend density |
| Line chart | 1 | Direct point/series editing, styling and viewport-aware data access |
| Pie/doughnut | 2 | Segment-local label/value/color, sensible legend and safe zero/negative rules |
| Hierarchy | 2 | Per-node plus controls/menu/size/position, semantic parenting and no automatic manual-layout reset |
| Branch tree | 2 | Same node interactions plus branch move/collapse and optional subtree layout |
| Flowchart | 2 | Node-local editing plus connector anchors/directions/labels; distinct graph rules from a tree |

Catalogue rows are a structural audit and proposed design coverage, not a certification of accounting compliance or a promise to reproduce ICAI copyrighted worked answers.

## Implementation options and recommendation

| Approach | Fit | Decision |
|---|---|---|
| Existing Tiptap financial table + custom NodeView/overlay | Preserves writing, cells, exact amounts, undo and document export; native before/after commands already exist | Retain; replace command placement and add semantic widths/section-total behavior |
| Custom SVG/HTML graph interaction layer | Smallest dependency surface; reuses current model/export | Viable if a prototype proves touch/resize/zoom reliability; substantial gesture/geometry maintenance |
| React Flow embedded in a Tiptap diagram NodeView | Purpose-built nodes, edges, per-node resizing, floating toolbars and touch patterns; MIT-licensed core | Preferred graph candidate for a focused prototype; compare measured loading/input performance with custom option before adopting |
| tldraw SDK | Strong full whiteboard model and gestures | More suitable if entire-page freeform drawing becomes the main product; production licensing and broader integration must be evaluated |
| AG Grid / Handsontable | Strong spreadsheet-style grid operations | Consider for a separate spreadsheet tool, not the default rich-note working; integration/printing and licensing differ by product/edition |
| More toolbar controls or popup settings | Low implementation effort | Does not meet the requested interaction model |

Recommended architecture: keep the existing note/document and financial math foundations; introduce a dedicated node editor within each diagram and direct boundary/context controls for accounting tables. Do not force financial workings and hierarchies into a single rendering/interaction engine. React Flow's controls are implementation primitives, not the finished UX. Custom left-click/hold behavior and our own clean menus are still required.

Lazy-load any diagram library when editing a diagram; keep per-node transient movement local. Do not serialize the full note on every pointer move. Release one model/history transaction on pointerup; cancellation restores the original. Preserve a lightweight deterministic SVG renderer for read-only/server/print output so exported documents do not depend on a live canvas library.

Model changes need explicit compatibility: default old nodes to 150 × 64; validate new dimensions/styles on the server; preserve IDs and manual positions; add total-scope and semantic column metadata without interpreting older totals differently. Public/protected/read-only documents must not gain edit controls. A version bump or optional-compatible attributes must be selected with old-client refusal/migration tests, not assumed harmless.

## Delivery and acceptance

1. Interaction prototype: one hierarchy and one P&L on desktop and an actual phone. Demonstrate side/bottom plus, requested click/hold menu, node move/resize and insertion around a total. Resolve the gesture model before another broad rollout.
2. Hierarchy implementation: geometry/anchors, new-node placement, contextual controls, text editor, manual positions, branch operations, persistence/migration and one-step undo.
3. Accounting implementation: semantic widths/row roles, boundary insertion, scoped totals, analysis/final amounts and independent account-side behavior. Start with journal, P&L, balance sheet and ledger.
4. Apply family-specific structures to the remaining catalogue; add working-note links and personal layout reuse. Certify old documents, touch/keyboard and A4 output.

Acceptance must test the exact actions the student described, not just whether corresponding commands exist: hover-to-plus travel, click vs drag, hold vs move, menu remaining open after release, keyboard/text-selection behavior, resizing a node while its connector follows, no reposition after add/reopen, inserts immediately before/after totals, correct inclusion/exclusion, no double counting, amount/folio widths versus particulars, independent account sides, blank template reuse, safe migration and printed layout. Test physical Android Chrome/WebView and iOS Safari where supported; headless touch emulation is not hardware certification.

## Primary sources reviewed

- ICAI Foundation Accounting, January 2026 suggested answers: https://resource.cdn.icai.org/91195bos-aps4356-sa-fnd-p1.pdf
- ICAI Intermediate Advanced Accounting, September 2025 suggested answers: https://resource.cdn.icai.org/89270bos-aps3012-int-p1.pdf
- ICAI Intermediate Cost and Management Accounting, September 2025 suggested answers: https://resource.cdn.icai.org/89273bos-aps3012-int-p4.pdf
- Miro mind-map interactions: https://help.miro.com/hc/en-us/articles/360017730753-Mind-map
- React Flow per-node resize: https://reactflow.dev/api-reference/components/node-resizer
- React Flow node toolbar: https://reactflow.dev/examples/nodes/node-toolbar
- React Flow touch interaction: https://reactflow.dev/examples/interaction/touch-device
- React Flow performance: https://reactflow.dev/learn/advanced-use/performance
- React Flow license/product: https://reactflow.dev/
- Tiptap table commands/settings: https://tiptap.dev/docs/editor/extensions/nodes/table
- tldraw gesture options: https://tldraw.dev/sdk-features/options
- tldraw production license: https://tldraw.dev/community/license
- Handsontable license: https://handsontable.com/docs/react-data-grid/license-key/
- AG Grid editions: https://www.ag-grid.com/react-data-grid/community-vs-enterprise/
- W3C dragging alternatives: https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- NN/g contextual menu guidance: https://www.nngroup.com/articles/contextual-menus-guidelines/

These sources inform the design. Proposed default widths, gestures, total-scoping rules and choice of implementation remain product/engineering recommendations to validate, not instructions attributed to ICAI or universal student behavior.
