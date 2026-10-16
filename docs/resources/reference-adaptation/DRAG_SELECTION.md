# Resources — sidebar Trash, dragging and highlight selection

Status: deployed and verified.

## Adapted behavior

- Trash is a collection-navigation destination, not a Filters option.
- Selected cards and rows have a highlighted background and border with no checkbox/tick. The compact selection toolbar provides clear, select-all, count, details, share, move, Trash and More controls as applicable.
- Desktop supports Ctrl/Command toggling, Shift ranges and blank-space marquee selection. Touch taps toggle selection; long-press then drag moves selected files. Ordinary scrolling and two-finger gesture input are not replaced with a zoom slider.
- Files can be dropped on folder tiles, breadcrumb destinations and desktop sidebar folders. My resources accepts a drop back to the root. Existing ownership, destination-cycle, stale-operation and undo protections remain.
- Dropping files on Community opens a confirmation dialog. Cancellation sends no sharing mutation. Confirmation submits eligible owned files for moderation without moving them or replacing their original content. Foreign, trashed, quarantined and retained replacement-version sources are refused.
- Mobile keeps compact collection navigation and toolbar controls. Sidebar folder destinations remain desktop-only; mobile supports folder tiles and the Move picker.

## Release evidence

- Source: `650efb11a191645e5a5600fb57788acbd169efe6`.
- Browser run: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38967680252 — passed.
- Screenshot artifact: `12075946682`, 65 screenshots. Reviewed desktop sidebar targets, mobile navigation/selection toolbar, highlight-only selection, marquee and compact Filters without Trash.
- Browser layouts: 320, 390, 768, 820, 1024 and 1440px. Native Community and sidebar-folder drops, cancelled/confirmed sharing, desktop marquee, touch long-press drops, context menus, keyboard controls, dialogs, transfers and uploads passed.
- Release: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38967680360 — verification and deployment passed.
- All 1,404 tests, TypeScript, ESLint, production build, D1 index checks, native bundle, search benchmark, backup restore, migration ledger, Worker budgets and smoke checks passed.
- Web Worker: `d0c9be23-b815-4b46-a08a-89157b3c2c09`.
- Live app-config confirmed the exact source. A normal account completed three-part upload, idempotent finalization, exact private download, owned hierarchy, move/Trash undo and stale-revision refusal. Community submission required confirmation, remained pending moderation, retained the source/folder and refused anonymous access. Test resources and original bytes were removed.
- Live page: https://ca-progress-v2.habeebaasif622.workers.dev/resources

## Existing platform warning

Deployment emits a pre-existing warning about the configured `CommunityChannelCoordinator` Durable Object class not being exported. This update does not modify that chat/coordinator binding; the Resources Community submission endpoint passed its live checks. The warning is not evidence that Community chat coordination works and remains outside this change.
