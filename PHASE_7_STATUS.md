# CA Progress V2 — Phase 7 Status

Phase 7 implements Personal Notes, Uploads & Resource Library only in the isolated V2 project.

## Implemented

- Rich-text personal notes with title, subject, chapter, tags and private/shared visibility.
- Private Cloudflare R2 bucket `ca-progress-v2-staging-user-resources` for PDF, JPG/JPEG, PNG, WebP, DOC and DOCX files up to 10 MB.
- Server-only upload path with authentication, size, extension, MIME and magic-byte validation plus safe filename normalization.
- Supabase Postgres remains the metadata, authorization and moderation source of truth; file bytes are stored in Cloudflare R2.
- Private file delivery is streamed through an authorized Worker route; the R2 bucket has no public URL.
- My / Shared / ICAI library views with visually distinct official ICAI resources.
- Pending / approved / rejected / reported moderation states.
- Moderator/admin/owner/parent-owner review route and report workflow.
- Responsive desktop/mobile layouts plus loading, error, empty, permission and not-found states.

## Security boundaries

- Private file bytes are not readable or writable directly by authenticated browser clients.
- R2 access is provided through the Worker binding `USER_RESOURCES_R2`; no R2 access key is exposed to the browser.
- Uploaded resource metadata is read-only to authenticated clients; create/update/delete mutations use authenticated security-definer RPCs.
- Note insert/update is RPC-controlled; owner delete remains RLS-protected.
- Shared content is not readable to other users until moderation status is `approved`.
- Reporting an approved shared item immediately changes it to `reported`, hiding it from Community reads until moderation.

## Deferred

- Plan-based storage quotas remain an entitlement-system concern for Phase 11.
- Smart planner / revision recommendation work remains Phase 9.
- Full Community messaging remains Phase 10.
