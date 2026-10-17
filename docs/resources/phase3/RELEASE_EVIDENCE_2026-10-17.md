# Typed notes and CA Formats release — 17 October 2026

- Verified and deployed source: `5d95fe7265f281c36a68d8a5b8581f2e645cd809`.
- Cloudflare web version: `7779de5b-fa73-451d-89e5-f69d87732727`.
- Editor: https://ca-progress-v2.habeebaasif622.workers.dev/notes/new .
- Release workflow: https://github.com/Dellybizz/ca-progress-v2/actions/runs/39032897744 — verify job `117396842201` and deploy job `117398259929` succeeded.
- Separate browser certification: https://github.com/Dellybizz/ca-progress-v2/actions/runs/39032897728 — job `117396857937` succeeded.
- Browser artifacts: `12100893488` (separate certification) and `12101036968` (release verification), with 82 screenshots/PDF files in each set.

## Delivered

A compact, separate Notes authoring surface with a grouped rich-text toolbar, contextual table commands, owned images, equations, references, attachments, outline/find tools, page setup and browser PDF printing. The catalogue includes 30 configurable CA formats and 82 variants. Financial layouts insert editable tables with blank amounts; charts and trees retain editable data. Orientation changes retain configured data, and excess configuration is rejected without silently dropping entries.

Versioned structured documents are validated server-side and produce a safe HTML derivative. Legacy text, RTL direction, merged tables and original HTML are retained. Owner/context-scoped device drafts support recovery and guarded background saving. Typed notes appear in Resources, while authoring remains a separate feature. Duplication updates document identity; unsupported future structured schemas and flattening legacy writes are refused.

## Verification

- 1,419 tests passed; zero failures. TypeScript, ESLint and production build passed.
- Real component browser checks passed at 320, 390, 768, 820, 1024 and 1440px, including insertion/configuration, chart re-editing, preserved orientation data, table commands/undo, images/equations, metadata, save while typing, failed-save recovery and legacy import.
- Mobile and desktop screenshots and browser-generated A4 output were reviewed. Hindi font fallback and equation styling were included in output checks.
- Existing file-manager navigation, touch/keyboard/drag selection, marquee edge scrolling, dialogs, previews and transfers passed.
- Worker size/runtime checks, backup restore, migrations and foreign-key checks passed before publication.
- An isolated authenticated, onboarded account created a structured CA table/tree note against deployed D1. Exact stored JSON, editor reload, Resources discovery, subsequent update, stale-write rejection and anonymous export refusal passed.
- Live three-part upload, retry identity, exact private download, owned folder operations, stale undo refusal, Trash restore, explicit Community submission/moderation and anonymous access rejection passed. Fixture notes, uploaded resources and original bytes were removed; fixture sessions were revoked.
- Public `/api/app-config` confirmed the deployed source above.

Physical Android keyboard/stylus behavior remains unverified. Full incremental history, cross-device reconciliation, native background jobs and handwriting/PDF annotation remain later phases. These are editable study formats; this release does not add automatic accounting calculations or certify statutory compliance.
