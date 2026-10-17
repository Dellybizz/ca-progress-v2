# Resources reference adaptation — Phase 1

Status: complete and deployed.

## Scope

Adapt the reference's alignment and hierarchy to CA Progress. Retain the product's collection navigation, academic context, colours, typography, Apply-based filters, gesture resizing and separate Notes authoring flow. File-card construction and contextual-action redesign remain later phases.

## Implementation

- One breadcrumb row, followed by a shared New/search/filter/layout row on desktop. Mobile retains its compact icon row and expanding search.
- A common 16px desktop and 8px mobile gutter; folder and file columns share width and spacing, including during gesture resizing.
- Collection toolbars remain aligned when personal creation is unavailable, as in Community.
- Selection occupies the toolbar's reserved row rather than adding height above the files.
- The canvas fills the viewport above the measured fixed footer. Folder navigation has a bounded scroll area so it cannot consume the file canvas.
- Empty-state content is centred within the remaining canvas without a second outlined upload container.
- Academic filtering does not add another location breadcrumb when the manager already supplies one.
- Tablet Resources width excludes the application's 76px navigation rail. The left-aligned New menu opens inward from its button.

## Acceptance

Verify at 320, 390, 768, 820, 1024 and 1440px with the full production stylesheet. Check folder/file column edges, toolbar alignment, expanded search bounds, New menu bounds, stable selection position, utility docks, empty and sparse libraries, short viewports, cursor pagination, Apply-based filtering, mouse/trackpad and touchscreen gesture input, Community layout and horizontal overflow. Retain existing upload, action, navigation and permission regressions.

## Release evidence

- Deployed source: `d94f422c7f6b92711906cc4cf69ef4fc69d3cc90`.
- Web Worker version: `899b1d34-aba6-4df1-941b-331f921f477e`.
- Browser verification: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38936941262 — passed at all six widths, with reviewed normal, empty, sparse, Community, Details and Transfers captures.
- Screenshot artifact: `file-manager-browser-d94f422c7f6b92711906cc4cf69ef4fc69d3cc90`, ID `12061387570`.
- Release verification and deployment: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38936941600 — passed.
- TypeScript, lint, production build and 1,401 automated tests passed. Database index validation, native bundle, search benchmark, backup restore, Worker size and smoke checks passed.
- Live app-config confirmed the exact source. Normal-account sign-in, three-part upload, finalization, idempotent retry, exact private download, owned hierarchy, move/Trash undo and stale revision refusal passed; fixture resources and original bytes were removed.
- Live page: https://ca-progress-v2.habeebaasif622.workers.dev/resources
