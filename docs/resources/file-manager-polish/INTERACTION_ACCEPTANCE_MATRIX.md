# File manager interaction acceptance matrix

Proposed acceptance cases, 15 October 2026. **Status: specification, not a claim that these tests already pass.** All rows are mandatory for the supported capability unless explicitly marked conditional. Unsupported capabilities must have no misleading active control. The [implementation plan](RESEARCH_AND_IMPLEMENTATION_PLAN.md) defines work-package dependencies; the [source register](SOURCE_REGISTER.md) records research evidence.

Each implemented case needs an evidence link, result, browser/device, source commit and owner. Run mutations against owned synthetic fixtures. “No data loss” includes originals, metadata, versions, folder relationships and retained queued sources. Test permission denial on the real server, not just a disabled button.

## Navigation and layout

| ID | Trigger/scenario | Expected result | Package |
|---|---|---|---|
| NAV-01 | Open My files from a fresh session | Correct owner/root, clear title and meaningful initial loading; no other account's cached state | 02 |
| NAV-02 | Enter a nested folder and use breadcrumbs | Correct children and path; no duplicated/skipped breadcrumb; focus stays meaningful | 02 |
| NAV-03 | Browser Back/Forward after folder/search changes | Scope, query, loaded position and focused item restore when still valid | 02 |
| NAV-04 | Refresh a deep-linked folder/search | Validated URL reproduces the view; unavailable folder gives recovery to parent/root | 02 |
| NAV-05 | Switch personal/official/community | Correct capabilities and search scope; no leftover selection targeting old collection | 02–03 |
| NAV-06 | Open Recent/Starred/Unfiled | Smart-view meaning and dates are explicit; no implied physical folder move | 02 |
| NAV-07 | Rename/move/delete the currently open folder elsewhere | Reconcile stale path safely; explain change and offer valid parent/root | 02–04 |
| NAV-08 | Expand a large folder tree | Fetch only needed children/path; loading/retry and keyboard expansion work | 02,07 |
| NAV-09 | Switch grid/list/compact density | Same identities, selection, query and sort; no accidental navigation | 02–03 |
| NAV-10 | Reload/switch accounts after changing preferences | Correct owner-scoped layout/columns; no sensitive state leakage | 02 |
| NAV-11 | Sort by every column and reverse | Server order matches header state; stable tie-breakers, Unicode/numeric names and unknown sizes correct | 02,07 |
| NAV-12 | Resize/hide/reset optional columns | Name/actions remain usable; widths bounded; no loss after reload | 02 |
| NAV-13 | Narrow screen, long names, 200% zoom | No inaccessible controls or horizontal page overflow; safe truncation/full-name labels | 07 |

## Selection, focus and actions

| ID | Trigger/scenario | Expected result | Package |
|---|---|---|---|
| SEL-01 | Single click desktop row/card | Selects that item without opening a modal or starting an operation | 03 |
| SEL-02 | Ctrl/Cmd-click multiple items | Toggles only target; focus and selection stay distinct | 03 |
| SEL-03 | Shift-click forward/backward from stable anchor | Exact range in displayed order; extending/reversing does not move original anchor unexpectedly | 03 |
| SEL-04 | Checkbox and Shift-checkbox | Additive selection/range with no file opening; keyboard equivalent works | 03 |
| SEL-05 | Arrows in list and varying grid column counts | Correct focus movement and scroll-into-view; no focus on unmounted item | 03,07 |
| SEL-06 | Shift+arrows, Home/End, Page Up/Down | Documented range/navigation behavior and accessible announcements | 03 |
| SEL-07 | Ctrl/Cmd+A in grid versus in search/rename input | Select loaded page only in file surface; native text select-all preserved in inputs | 03 |
| SEL-08 | Change page/query with active selection | Explicit page-scoped policy; no hidden selection used in bulk mutation/export | 03 |
| SEL-09 | Right-click selected/unselected row | Preserve existing selected group or establish the new target predictably | 03 |
| SEL-10 | Three-dot button, right-click and Shift+F10 | Same permission-filtered actions and target; keyboard menu focus works | 03 |
| SEL-11 | Double click/Enter/Space | Open or preview as specified; no duplicate request from click/double-click race | 03,06 |
| SEL-12 | Tap/long-press/explicit checkbox on touch | Open versus selection unambiguous; non-gesture alternative available | 03,07 |
| SEL-13 | Escape with menu, preview, inspector and selection | Close topmost surface first, restore focus, preserve lower state | 03–04 |
| SEL-14 | Mixed owned/read-only/trashed selection | Only compatible actions; explanation before partial eligibility operations | 03–04 |
| SEL-15 | Permission changes after menu opens | Server denies safely; local state refreshes without losing unrelated selection | 03–04 |

## Menus, popups and organization

| ID | Trigger/scenario | Expected result | Package |
|---|---|---|---|
| POP-01 | Open New/Sort/Filter near viewport edge | Correct anchor, collision handling, checked state, outside-click and Escape dismissal | 02–04 |
| POP-02 | Open a modal from a menu | Menu closes; focus moves into dialog and returns to surviving trigger on close | 04 |
| POP-03 | Open Details while browsing files | Desktop canvas remains operable; changing selection updates inspector, not a blocking overlay | 04 |
| POP-04 | Select multiple items with inspector visible | Aggregate count/known size and mixed metadata; unknown sizes labeled | 04 |
| POP-05 | Switch inspector target with dirty edits | Explicit save/discard/cancel; edits never applied to a different file | 04 |
| POP-06 | Rename empty/long/Unicode/duplicate display name | Local validation and server error align; source filename/extension behavior explicit | 04 |
| POP-07 | Rename network/server failure then Retry | Input retained; one committed rename; no false success | 04 |
| ORG-01 | Move into owned nested folder | Hierarchical destination picker and current location; stable file ID and metadata | 04 |
| ORG-02 | Move folder into itself/descendant or foreign folder | Invalid destination disabled and rejected server-side; no cycle or orphan | 04 |
| ORG-03 | Destination renamed/deleted during confirmation | Conflict recovery with a fresh destination; source remains accessible | 04 |
| ORG-04 | New folder from picker/current location | Correct parent, title validation, idempotent creation and immediate usable result | 04 |
| ORG-05 | Duplicate/copy versus move | Correct semantics, quota handling and independent identity/bytes policy | 04 |
| ORG-06 | Tag a newly uploaded file from inside a folder | Subject/chapter options available; optional null assignment; folder unchanged | 04 |
| ORG-07 | Change subject/remove chapter | Incompatible chapter cleared; missing IDs produce friendly validation, no raw FK error | 00,04 |
| ORG-08 | Bulk tag mixed values | Leave-unchanged versus clear explicit; only requested metadata modified | 04 |
| ORG-09 | Retag item out of active filter | Explain disappearance, update counts and offer locating the item | 04,06 |
| ORG-10 | Drag files onto valid/invalid folder | Visible destination and eligibility; accessible Move alternative; no browser navigation | 04 |
| ORG-11 | Filename conflict in copy/upload | Explicit skip/keep-both/version choice; apply-to-remaining limited to this batch | 04–05 |
| ORG-12 | Nonempty folder Trash (conditional capability) | Server-owned descendant operation, accurate counts/recovery; otherwise honest unsupported action | 04 |

## Uploads and transfer sidebar

| ID | Trigger/scenario | Expected result | Package |
|---|---|---|---|
| UPL-01 | Choose/drop supported files | Simple picker only; no required tagging/title/privacy form; private null classification | 00,05 |
| UPL-02 | Queue persistence succeeds/fails | Close picker only after durable enqueue; preserve selection and explain device-storage failure | 05 |
| UPL-03 | Start upload and browse another app section | Transfer coordinator survives route changes; sidebar/status remains accessible | 05 |
| UPL-04 | Minimize/expand transfer center | Upload continues; counts and per-file states retained; keyboard focus safe | 05 |
| UPL-05 | Mixed-size parts including short final part | Actual bytes drive per-file/aggregate percent; no part-count average or preset milestones | 00,05 |
| UPL-06 | Bytes reach 100% before database commit | Saving state until resource ID/receipt; never Saved early | 00,05 |
| UPL-07 | Small direct R2 PUT blocked | Authenticated same-origin fallback uses same owner/intent/hash and truthful progress | 00,05 |
| UPL-08 | Real three-part upload over old size threshold | Middleware, route, R2 and real foreign-key DB agree; every receipt persists | 00 |
| UPL-09 | Pause/resume one file while another is active | Independent control; confirmed parts skipped; no duplicated source/metadata | 05 |
| UPL-10 | Add a batch while queue is running | Scheduler automatically includes new work without requiring a second manual Continue | 05 |
| UPL-11 | Network loss/reconnect during request or Saving | Clear waiting/retry state, bounded retry policy, receipt reconciliation | 05 |
| UPL-12 | Reload/tab leadership change | One owner-safe runner; sources/receipts recover; no promise of execution while browser closed | 05 |
| UPL-13 | Session expires/account switches | Stop old-owner transmission; no wrong-account continuation or old queue exposure | 05 |
| UPL-14 | Quota changes while queued/finalizing | Actual server allowance enforced; file source retained; actionable storage state | 00,05 |
| UPL-15 | Missing local source/reselect wrong or exact file | Explain reselect; size/full hash required; wrong bytes cannot resume | 05 |
| UPL-16 | One file fails in a mixed batch | Other eligible files continue; Retry failed excludes saved files | 05 |
| UPL-17 | Transient metadata/FK-related failure | Verified bytes and issued receipt retained; same-intent retry can finish | 00 |
| UPL-18 | Repeated completion/cross-tab completion race | Same resource ID; single quota spend and metadata insert; original never deleted by loser | 00,05 |
| UPL-19 | Cancel before/during/after finalization | Explicit legal transitions; confirmed server cleanup or tracked cleanup task; Saved requires Trash instead | 05 |
| UPL-20 | Speed/ETA under pause, jitter and retry | Measured active samples; no invented rate/ETA during Saving or insufficient samples | 05 |
| UPL-21 | Unsupported type/zero bytes/changed source | Clear per-file reason; no unnecessary reservation; retained valid files continue | 05 |
| UPL-22 | Browser-managed download | Report Download started only; no fabricated complete/percentage | 05–06 |
| UPL-23 | Folder upload (conditional capability) | Relative paths, conflicts, unsupported files and empty-directory policy tested; otherwise no active entry | 05 |

## Search, previews and information

| ID | Trigger/scenario | Expected result | Package |
|---|---|---|---|
| SEA-01 | Search a record beyond first loaded page | Whole authorized server collection searched; correct result/count | 06 |
| SEA-02 | Combine text/type/owner/date/chapter filters | Documented OR-within/AND-between semantics; visible scope and chips | 06 |
| SEA-03 | Remove one chip/Clear all | Exact intended query change; current collection retained; counts update | 06 |
| SEA-04 | Type quickly with responses arriving out of order | Aborted/stale response cannot replace newer results | 06 |
| SEA-05 | Empty library versus no matches versus request error | Distinct explanation and creation/clear/retry actions; no fake empty state | 06 |
| SEA-06 | Cursor expires because data changed | Safe restart/restoration message; no skipped/duplicated results presented as complete | 06 |
| SEA-07 | Search offline cached data | Explicit cached scope/freshness; no claim of complete server search | 06 |
| SEA-08 | Date range/timezone and unknown sizes | Valid normalized boundaries and consistent ordering/display | 06–07 |
| PRE-01 | Load thumbnails slowly/unsupported/quarantined | Correct fixed geometry/type icon; bounded requests; no forbidden original delivery | 06 |
| PRE-02 | Preview PDF/image/extracted document/large original | Supported viewer or honest fallback; no stuck loading on known unsupported state | 06 |
| PRE-03 | Download newly saved private original | Real access authorization and exact downloaded SHA-256; no signed-URL 403 | 00,06 |
| PRE-04 | Next/previous/close preview | Correct authorized query order; return focus and scroll to original row | 06 |
| PRE-05 | Version changes while thumbnail/viewer cached | Source/version/ETag identity invalidates stale preview safely | 06 |
| PRE-06 | Inspect activity/version load failure | Local Retry, preserved details and no blanket loss of file access | 06 |
| PRE-07 | Source/permission revoked while viewer open | Delivery stops or refresh denies as appropriate; no cross-owner stale URL/cache reuse | 06–07 |
| PRE-08 | Official resource | Provenance/verification and external-open context; no private-owner mutation controls | 06 |

## Trash, versions, accessibility and performance

| ID | Trigger/scenario | Expected result | Package |
|---|---|---|---|
| LIF-01 | Trash and Undo | Acknowledged server state, recoverable result and conflict-aware compensation | 04,06 |
| LIF-02 | Partial bulk move/Trash/restore | Per-item results; retry only failures; no generic all-success notification | 04 |
| LIF-03 | Restore after parent moved/deleted | Defined parent/root fallback, filename conflict handling and visible result | 04,06 |
| LIF-04 | Permanent delete cancel/confirm/race | Named scope; explicit destructive action; server recheck; no accidental browser-confirm acceptance | 04,06 |
| LIF-05 | Trash expiry and shared access | Backend retention/storage policy accurately shown; app's trashed-access restrictions preserved | 06 |
| LIF-06 | Restore historical version | Stable file identity and recoverable history; state refresh, quota/permission validation | 06 |
| LIF-07 | Stale version or changed file while restoring | Conflict shown; no overwrite of unrelated later change | 06 |
| A11Y-01 | Keyboard-only upload/find/move/tag/download/restore | Complete core task path, visible focus and no trapped non-modal dock | 03–07 |
| A11Y-02 | Screen reader with selection/sort/menu/modal/progress | Correct roles/names/states; concise announcements and focus restoration | 03–07 |
| A11Y-03 | Touch, zoom, reduced motion and high contrast | Same core actions available; no hover-only controls, tiny required targets or color-only state | 07 |
| A11Y-04 | Long duplicate/Unicode/RTL filenames | Distinguishable names and correct ID target; no broken layout or lost directionality | 07 |
| PERF-01 | Traverse 10,000–100,000 synthetic records | Bounded response/DOM, correct cursors and no silent data cap | 07 |
| PERF-02 | Large/deep folder trees | Lazy owned fetches/path handling, no full-tree payload on every file page | 07 |
| PERF-03 | 96 thumbnails plus active uploads on mid-range mobile | Bounded requests, responsive selection, measured memory and long tasks | 07 |
| PERF-04 | Large streaming source and repeated retry | Part-bounded memory, no whole-file Blob copy, measured retry amplification | 00,05,07 |
| PERF-05 | Observability and production fixture cleanup | Stage/correlation data without secrets; first failure preserved; only owned test data cleaned | 00,07–08 |
| REL-01 | Restored database migration and compatible rollback | Existing notes/uploads/receipts preserved; FK checks pass; expanded-part intents remain supported | 00,08 |
| REL-02 | Final signed-in deployed journey | Expected source version, three-part upload, idempotent save, exact private download and scoped cleanup pass | 00,08 |

## Evidence record template

For each case record: ID; implementation commit; supported surface; fixture description; browser/device/network; test or manual reproduction; expected/actual outcome; screenshot/trace/log link where relevant; accessibility evidence; status; unresolved issue. Never place passwords, session cookies, private document content or signed object URLs in evidence.

A package is complete only when its cases have results, not when the UI controls exist. Query-wide selection, folder upload and recursive Trash remain conditional until explicitly included in that release's supported-capability list; their absence must not produce misleading controls.
