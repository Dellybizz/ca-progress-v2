# CA Progress Product Phase 14 Status

## Status

**Phase 14: Complete**

- **14.1 — Export foundation + Progress PDF:** Complete
- **14.2 — Pro CSV exports + scale/security hardening:** Complete
- **14.3 — Premium backup + R2 safety + final closure:** Complete
- **Phase 15:** Not started

Phase 14 is closed on the `phase-12-operations-admin-platform` working branch. This record does not merge the branch to `main` and does not begin Phase 15.

## Final tier matrix

The current internal billing tier keys map to product plans as follows:

| Internal tier | Product plan | Phase 14 export access |
| --- | --- | --- |
| `free` | Free | Progress PDF |
| `basic` | Pro | Progress PDF, Study CSV, Test History CSV |
| `pro` | Premium | Progress PDF, Study CSV, Test History CSV, Full Backup |

Premium inherits the Pro export surfaces and adds the full-account backup.

## 14.1 — Export foundation + Progress PDF

Completed capabilities:

- server-owned export policy and tier mapping
- authenticated Progress PDF export
- requester-owned profile and chapter-progress reads
- deterministic PDF output
- valid empty-account export
- PDF control-character escaping
- private attachment response headers
- no arbitrary request-supplied user ID ownership override

## 14.2 — Pro CSV exports + scale/security hardening

Completed capabilities:

- Study CSV export for Pro and Premium
- Test History CSV export for Pro and Premium
- requester-owned D1 reads only
- deterministic column contracts and stable ordering
- zero-record exports
- bounded keyset pagination with no `OFFSET`
- thousands-row batch-boundary regression coverage
- CSV escaping for commas, quotes and line breaks
- UTF-8-safe output
- spreadsheet formula-injection neutralization for values beginning with `=`, `+`, `-` or `@`
- private, no-store download responses with safe attachment headers
- no R2 storage internals exposed by the CSV surfaces

## 14.3 — Premium full backup + R2 safety

Completed capabilities:

- Premium-only full backup endpoint
- streamed `application/x-tar` archive generation using Worker-compatible Web primitives
- explicit allowlist of user-owned D1 datasets rather than schema dumping or `SELECT *`
- deterministic dataset ordering and bounded keyset pagination
- default D1 backup batch size of 250 rows with a hard maximum of 500 rows
- user-owned uploaded-resource files included from the private R2 binding
- user-owned test-attempt attachment files included from the private R2 binding
- no signed URL generation for backup reads
- no R2 bucket names, storage paths, object keys, access credentials or upload-intent internals written into backup metadata
- safe archive filenames and TAR path-traversal protection
- missing private objects recorded as bounded safe warnings by record ID instead of exposing storage locators
- operational/moderation-only tables explicitly excluded where they are not part of the user's portable account data
- requester identity derived only from the authenticated session
- billing-unavailable state fails closed
- Settings exposes Full Backup only through the Premium entitlement
- `Cache-Control: private, no-store` and cookie-varying response behavior

## Security and privacy guarantees verified

- unauthenticated export requests are rejected
- lower tiers cannot use higher-tier export capabilities
- an arbitrary `userId` cannot redirect export ownership
- cross-user private records are excluded
- R2 file discovery is owner-scoped before object access
- exported metadata does not contain private storage locators
- signed URLs and Cloudflare/R2 credentials are not exported
- CSV spreadsheet-injection payloads are neutralized
- archive paths cannot escape the backup root
- operational upload-intent and anti-cheat internals remain outside the portable backup

## Scale and determinism verified

- large Study CSV datasets cross pagination boundaries without omission or duplication
- large Test History datasets cross pagination boundaries without omission or duplication
- full-backup D1 datasets cross thousands-row boundaries without omission or cross-user leakage
- oversized requested batch sizes are clamped
- zero-row datasets remain valid
- deterministic CSV contracts are preserved
- deterministic TAR generation and valid TAR termination are covered
- export generation remains compatible with the Cloudflare Worker runtime

## Final validation

The Phase 14 implementation head `edb8663a5860a442a4fd123a11e7970280b3d97b` passed both authoritative repository workflows before this closure record was written.

### V2 CI — passed

- permanent Supabase-retirement enforcement
- TypeScript typecheck
- lint with zero warnings
- retained D1 hot-query index validation
- Next.js production build
- OpenNext Cloudflare build
- production Worker dry-runs
- Cloudflare SSR route smoke
- repository-wide test suite
- final Supabase-retirement recheck

### Supabase Retirement Permanent Closure — passed

- retired migration/runtime-path enforcement
- retirement regression contract
- typecheck
- lint
- retained D1 index validation
- repository-wide tests
- Next.js production build
- OpenNext build and production Worker dry-runs
- SSR smoke
- final retirement rescan

The repository-wide test suite passed **389/389** tests on the implementation head.

## Closure

The Free, Pro and Premium Phase 14 export/backup matrix is implemented, owner-scoped, scale-tested and Cloudflare-compatible. Phase 14 is complete. Phase 15 remains intentionally unstarted.
