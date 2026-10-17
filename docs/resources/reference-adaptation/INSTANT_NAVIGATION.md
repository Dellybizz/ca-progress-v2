# Resources — location folders and responsive navigation

Status: deployed and verified.

## Behavior

- The sidebar lists only immediate children of the current folder. Root folders disappear when entering Accounts; only Accounts' children remain. Existing breadcrumb navigation, folder destinations and file ownership checks are retained.
- Removed the Folder options strip. New folder/notebook/section/page actions are consolidated in New. Current-folder management uses the menu beside the breadcrumb; tile context menus remain available.
- My resources, Community, ICAI and Trash switch through client navigation with real URLs and working history. The ICAI catalog arrives with the collection metadata; official academic/type filtering stays on the client. Chapter Hub links and subject validation are preserved.
- A bounded private page cache deduplicates requests, preloads a few nearby destinations and warms additional folders on hover/focus. Fresh cached pages render immediately; older pages refresh without a blank canvas. Mutations invalidate snapshots, and late pre-mutation responses cannot repopulate stale pages.
- Recent existing device snapshots can paint on reload before the server responds. They are owner/context scoped, limited to 30 seconds and skipped after mutations or when unsynced edits exist. A fresh authoritative response still follows.
- Search typing remains responsive and previews known matches. Simple filters can render from a complete cached page while the server confirms results. Uncached full-text searches remain pending until authoritative results arrive. Draft filters still apply only through Apply.
- Initial Resources metadata skips unused file-list, label-map, tag and importance queries. Private file-list APIs retain authentication and no-store headers.
- Preview requests are deduplicated, loaded near the viewport and limited to four concurrent requests. Preview URLs are reused in bounded tab memory, scoped to the signed-in owner/context. No public preview cache was introduced.
- Image thumbnails target up to 768px with high-quality resampling and the existing 180KB byte cap. Images that exceed the cap fall back to a smaller derivative. Existing standard thumbnails upgrade in the background from the authorized owner's original and update the visible preview after saving. Shared viewers cannot request the original-source fallback.

## Verification

- Source: `4f7b12ab8288f4688fafdaf5cce9f1a16522859d`.
- Browser run: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38982634519 — passed all existing suites and new delayed-network cases.
- Screenshot artifact: `12082101219`. Reviewed desktop/mobile layouts, removal of the options strip, navigation and preview states.
- Six layout widths: 320, 390, 768, 820, 1024 and 1440px.
- Deliberate 700ms API delay: release browser checks measured folder/Community/My resources switches at 30/25/34ms on desktop and 27/26/34ms on mobile. These are warm-cache render measurements, not a promise of zero network latency for uncached content.
- Reload test required the recent page to appear within 500ms of DOMContentLoaded while the API response was delayed by 700ms, then waited for authoritative results. Same-URL reset after searching, history, scoped child folders, focus preservation, uploads, touch dragging and all prior dialog/transfer checks passed.
- All 1,407 tests, TypeScript, ESLint, production build, D1 indexes, native bundle and search benchmark passed.
- Release workflow: https://github.com/Dellybizz/ca-progress-v2/actions/runs/38982634538.

- Web Worker: `6ba0a1e5-952a-4bbe-94d4-9cfb63873bd2`.
- Deployment passed Worker budgets, smoke checks, backup restoration and retained migration validation. Live app-config confirmed the exact source. A normal account completed three-part upload, idempotent finalization, exact private download, owned hierarchy, move/Trash undo and stale-edit refusal. Community submission required confirmation, remained pending moderation, retained its source/folder and rejected anonymous access. Fixture resources and original bytes were removed.
- Live page: https://ca-progress-v2.habeebaasif622.workers.dev/resources
