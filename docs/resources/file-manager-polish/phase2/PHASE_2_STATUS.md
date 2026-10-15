# File-manager polish Phase 2 — navigation and layout

Implemented against the existing authenticated workspace API; no database migration or file identity changes.

- Folders opens the real root (`view=folder`, no folder ID), distinct from recursive All files. Child folders and root files remain in the same workspace.
- Breadcrumb navigation exposes the root and complete returned ancestor path, marks the current folder, supports keyboard focus, wraps on narrow screens, and identifies future drag destinations with stable `data-folder-target` IDs. Drag execution remains Phase 3/4 work.
- View, folder, layout, search, sorting, secondary sorting, group, subject/chapter, important flag, type filters, tag/status/owner/date filters and page size serialize into namespaced URL parameters. Host page parameters and hash survive. Invalid enums and page sizes normalize; strings are bounded. Shared collections discard personal folder state.
- Folder/view navigation pushes browser history. Live filter/layout edits replace the current entry to avoid one Back action per keystroke. Back/Forward and refresh restore the current entry. Search edits do not remount the manager or steal focus.
- Navigation remounts ephemeral selection, dialogs and cursor pages, while route restoration immediately supplies filters to the renderer. Old page requests abort; a pending folder no longer displays the model's unrelated All files fallback.
- Layout preferences use a versioned user-and-academic-context key. URL layout takes precedence; otherwise the saved layout is applied and reflected in the URL. Legacy global layout preferences are intentionally not imported across users. Compact is the existing dense list option.
- Owner/context and collection changes reset collection state. Existing offline page storage remains owner scoped. Full transfer coordination remains in Phase 5.
- Subject/chapter options remain available inside folders, including post-upload file organization.
- An unavailable folder offers a return-to-root action. Server owner authorization, folder-cycle rules, empty-folder deletion, file quota and upload validation are unchanged.

## Verification

Domain tests cover root versus All files, complete filter/Unicode round trips, host parameter preservation, malformed URLs, shared-folder isolation and preference identity collisions. A real-component Chromium journey checks nested folders, breadcrumbs, Back/Forward, reload, search focus, layout restoration, navigation selection reset and horizontal overflow at 1440px and 390px. It is included in the existing Resources release workflow after preview compilation. Browser tests use intercepted fixture APIs; authenticated production integrity remains covered by the existing signed-in upload/deployment gates.

Local browser download was unavailable in this environment; report CI browser results separately rather than claiming local execution. Repository tests, lint, TypeScript and preview bundling are run locally. Production deployment must pass the existing release workflow and live gates before being called verified live.
