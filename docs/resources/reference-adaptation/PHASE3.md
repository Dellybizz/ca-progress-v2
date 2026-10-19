# Resources reference adaptation — Phase 3

Status: complete and deployed.

## Scope

Adapt contextual actions to CA Progress. Keep existing ownership, sharing, Trash, offline and operation-retry rules. Filters and discovery refinements remain Phase 4.

## Implementation

- File menus group opening/details, single-file edits, organisation, metadata export and destructive actions with restrained separators and consistent 18px icons. Destructive actions remain last.
- Real keyboard shortcut hints accompany Open, Rename and Move to Trash. F2 and Delete also work from an open file menu; normal arrow, Home/End, Enter and Escape interaction remains supported.
- Selection shows relevant primary actions, with secondary actions under More. Bulk selection omits single-file operations. The clear-selection cross is first in the toolbar; mobile uses labelled, accessible icon buttons for primary actions.
- Each folder tile has its own action button and menu: Open, Rename, Move and Delete empty folder. Right-click and Shift+F10 open the same menu. No menu is nested inside the folder's navigation button.
- Folder actions pass the chosen tile's identity to existing dialogs and safeguards. Empty-folder deletion retains confirmation; nonempty-folder refusal remains enforced on the server.
- Deleting a child folder leaves the user in the current location. Deleting the current folder still returns to its parent.
- Menus render outside scroll containers, stay within viewport bounds, retain touch targets and restore focus on Escape.

## Acceptance

Verify full-shell spacing at 320, 390, 768, 820, 1024 and 1440px. At desktop and mobile widths, verify grouped menus, folder rename identity, child-folder delete confirmation and unchanged location, right-click/keyboard opening, Escape focus return and F2. Retain existing multi-selection, permission, navigation, move retry, folder/file drag, Details, upload and transfer tests. Review menu and selection screenshots before completing the release.

## Release evidence

- Deployed source: `d4121eb21fdac96f5f875e7388add2c4b547465d`.
- Browser suite: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38943008893 — passed all six widths and desktop/mobile action, navigation, dialog and transfer checks.
- Screenshot artifact: `file-manager-browser-d4121eb21fdac96f5f875e7388add2c4b547465d`, ID `12064365606`.
- Reviewed desktop and touch file and folder menus, 390px selection toolbar, and the 320px full-shell library. Confirmed viewport bounds, touch targets, aligned columns, single-line folder labels and a reachable selection clear control.
- Regression coverage includes preserving Escape focus during background refresh, waiting for asynchronous Details/Transfers coordination, and distinguishing navigation buttons from new folder-action buttons.
- Local checks: 68 targeted tests, TypeScript and ESLint passed.
- Release workflow: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38943008916 — verification and deployment passed.

- Web Worker version: `02ebd5d7-32f9-470b-b261-21289c3df967`.
- All 1,401 automated tests, TypeScript, ESLint and the production build passed. Database index validation, native bundle, search benchmark, backup restore, Worker size and smoke checks passed.
- Live app-config confirmed the exact source. Normal-account sign-in, three-part upload, finalization, idempotent retry, exact private download, owned hierarchy, move/Trash undo and stale revision refusal passed. Fixture resources and original bytes were removed.
- Live page: https://ca-progress-v2.habeebaasif622.workers.dev/resources
