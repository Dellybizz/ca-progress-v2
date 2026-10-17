# Notes Phase 3 release evidence

Released 2026-10-17. Deployed application source: `1d990f8395139a3e0bb960e0978260fd95d7a130`.

## Exact-source verification

- Release workflow [39054959354](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39054959354): verification and deployment both succeeded.
- Independent browser workflow [39054959382](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39054959382): succeeded.
- 1,429 automated tests passed; no failures. Type checks, lint, production Next build and Worker gates passed.
- Financial interactions passed at 1440px and 390px: precision-preserving number styles, row/column renaming/reordering, exact signed totals, stale detection, editable sources, recalculation, undo/redo, incompatible variant refusal and blank reuse.
- Notes regression suite covered 320, 390, 768, 820, 1024 and 1440px, object editing/resizing, legacy tables/RTL, recovery and A4 exports.
- Final browser artifact `12109570735` contains 93 PNG/PDF evidence files. A4 portrait: 594.96 × 841.92pt; landscape: 841.92 × 594.96pt. Mobile inspector preview font and fixed actions verified.

## Production verification

- Live app-config gate confirmed the exact expected source commit.
- Web Worker version: `e2fbb3c4-f685-4aa6-b913-9a74e84b9556`; compressed upload: 3797.91KiB.
- Preview Worker version: `ef4cd7af-6a09-48ef-ae91-62dcacfcdf9a`; compressed upload: 509.67KiB.
- Isolated signed-in production fixture passed structured CA table/tree creation, exact D1 JSON round trip, editor reload, Resources listing, orientation update, stale-save refusal and private export. The financial journal fixture retains canonical decimal amounts, configuration, stable identities and total source/baseline metadata.
- Live upload, private download, move/Trash revision checks and Community submission controls passed. Fixture resources/bytes were cleaned up by the release workflow.
- Backup restore drill passed with existing notes/uploads unchanged and no foreign-key violations.
- Read-only signed-in UI inspection confirmed CA Formats and a ten-column triple cash book preview in production. Cancel returned to an empty note (0 words/0 characters); no test content was inserted or saved in the user's notes.

## Scope

Configurable editable CA workings, numeric display controls, explicit signed totals and blank reuse are released. Structures are study templates; general spreadsheet formulas, automatic tax computations and filing certification are outside this phase. Physical-device certification and handwriting remain later phases.
