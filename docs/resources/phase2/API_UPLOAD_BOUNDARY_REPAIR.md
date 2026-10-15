# Versioned upload middleware repair — 15 October 2026

The user reported the generic “Upload failed. Retry to continue.” message after the recovery and size-limit releases. Reproduction against the deployed-source middleware using real NextRequest/NextResponse showed:

| Request | Incorrect rejection before the handler |
| --- | --- |
| 512-byte binary upload part | 415 UNSUPPORTED_MEDIA_TYPE |
| 5 MiB binary upload part | 413 PAYLOAD_TOO_LARGE |

The general v1 API middleware allowed only JSON/form requests and imposed a 1,000,000-byte bound. The upload route's 5 MiB binary parts and native base64 envelopes were therefore blocked before its ownership/hash/size checks ran. The previous browser fixture intercepted API calls without invoking this middleware, so it missed this integration failure.

The repair scopes the transport exception to PUT `/api/v1/resources/transfers/{uuid}/parts/{1..10000}`: binary parts at most 5 MiB and native JSON at most 7 MiB. Cross-site rejection, version checks, ordinary API bounds, handler authentication/ownership, stream bounds, part hashes and transfer leases stay enforced. Requests without Content-Length still encounter the streamed handler bound. This is a chunk transport bound, not a per-file cap.

The browser client now reads the nested API error envelope's message/code and reports HTTP status for non-JSON failures. It no longer hides these failures behind the same generic retry text.

Five new executable tests use real NextRequest/NextResponse and actual middleware/part-handler code to check browser and native transport, ordinary bounds, cross-site/owner rejection, missing Content-Length and structured client errors. All 1,360 tests, TypeScript and targeted lint passed locally. The existing real-component browser fixture now invokes the actual middleware before its server adapter, covering the 12 MiB upload/resume and small blocked-R2 fallback at desktop and phone widths.

The deployment adds live negative probes for small/full binary parts and the native envelope: each must reach application authentication and return 401, rather than middleware 413/415. A separate ordinary JSON probe must retain 413. Synthetic bytes use no account or real intent and cannot create stored files.

Release status: pending CI and deployment. No migration or new APK is included; this repair does not complete the Phase 3 editor.

## Initial production verification and rollout guard

The runtime repair was deployed from `1343b680341617c612928aa34f8dfa20877fe764` in run `38669326308`, web Worker version `000b771b-42d0-4912-ac0d-ee5e8564cd9d`. Its first immediate post-deploy small-part probe still received 415. Once rollout settled, app-config reported that exact source and running all four live probes directly passed: small/full binary and native JSON each reached application authentication (401), and ordinary JSON retained 413. The deployment job was correctly left failed by its immediate probe rather than silently declaring success.

The verification script now checks the expected deployed commit and allows at most seven bounded attempts for known old-edge 413/415 responses and transient edge/network failures, with 12 seconds between attempts. Unexpected unauthenticated success (200) fails immediately; persistent rejection still fails. Three executable tests cover old/new-version transitions, immediate security failure and bounded exhaustion. All **1,363 tests** pass locally. The follow-up release must complete CI and live verification before its evidence is finalized.
