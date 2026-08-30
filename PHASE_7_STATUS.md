# CA Progress V2 — Phase 7 Status

Phase 7 implements Personal Notes, Uploads & Resource Library only in the isolated V2 project.

## Implemented

- Rich-text personal notes with title, subject, chapter, tags and private/shared visibility.
- Private `user-resources` Supabase Storage bucket for PDF, JPG/JPEG, PNG, WebP, DOC and DOCX files up to 10 MB.
- Server-only upload path with authentication, size, extension, MIME and magic-byte validation plus safe filename normalization.
- Database metadata separated from file bytes.
- Short-lived signed private/shared file access after metadata authorization; no public Storage URLs.
- My / Shared / ICAI library views with visually distinct official ICAI resources.
- Pending / approved / rejected / reported moderation states.
- Moderator/admin/owner/parent-owner review route and report workflow.
- Responsive desktop/mobile layouts plus loading, error, empty, permission and not-found states.

## Security boundaries

- Private file bytes are not readable or writable directly by authenticated browser clients.
- Uploaded resource metadata is read-only to authenticated clients; mutation paths are server-controlled.
- Note insert/update is RPC-controlled; owner delete remains RLS-protected.
- Shared content is not readable to other users until moderation status is `approved`.
- Reporting an approved shared item immediately changes it to `reported`, hiding it from Community reads until moderation.

## Deferred

- Plan-based storage quotas remain an entitlement-system concern for Phase 11.
- Smart planner / revision recommendation work remains Phase 9.
- Full Community messaging remains Phase 10.
