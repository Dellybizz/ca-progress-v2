# Handwriting Phase 4 release evidence

Application source: `569b4b836cfea4037df408e7d6bec25fd7b6c3ab` on `onboarding-design-phase7`. Released 17 October 2026 UTC (18 October in India).

- [Release workflow](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39067429671): verification and deployment succeeded.
- [Independent browser workflow](https://github.com/Dellybizz/ca-progress-v2/actions/runs/39067429745): succeeded on the same source.
- 1,433 tests passed. Type checks, ESLint, production build, Worker size/runtime checks and full Resources/Notes browser regression passed.
- Ink tools passed at 320, 390, 768, 820, 1024 and 1440px. Checks cover pen/highlighter, shapes, pressure input, lasso/move/resize, erasing, deletion, single-operation undo/redo, pointer cancellation, explicit finger mode, nearby typing, offline recovery and vector A4 exports. Screenshots and portrait/landscape PDFs were reviewed.
- Live isolated signed-in fixture passed structured ink plus CA table/tree creation, exact D1 JSON roundtrip, vector HTML assertions, editor reload, Resources listing, orientation update, stale-save refusal and private export boundaries.
- Existing upload/download/Community tests passed. Fixture resources and bytes were cleaned up. Backup restoration preserved existing notes/uploads with no foreign-key violations.
- Web Worker version: `c4d55286-ca51-4867-ab45-a7369d32cf62`; compressed size: 3800.60 KiB. Preview Worker: `472264f9-7819-478d-9d67-a4012c962162`.

## Certification boundary

Handwriting tools are live via Notes → Insert content → Handwriting. Physical tablet/phone/stylus tests remain outstanding: browser emulation does not certify actual pen latency, palm rejection or device-specific keyboard/zoom behavior. Ink is an anchored drawing block, not a PDF-file overlay or pixel-linked annotation on an arbitrary chart. See IMPLEMENTATION.md for the persistence and reflow contract. Phase 5 cross-device and mixed-content certification remains separate.
