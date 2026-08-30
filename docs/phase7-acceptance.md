# Phase 7 acceptance mapping

1. **Private files cannot be fetched by another user through a guessed URL.** The `user-resources` bucket is private, authenticated Storage object policies are removed, and `/api/resources/[id]/access` first authorizes metadata access before a server-only service-role client creates a 120-second signed URL.
2. **Upload validation occurs server-side.** `/api/resources/upload` verifies authentication, content length, maximum file size, extension, exact MIME mapping, file signature/magic bytes, and safe filename normalization before server-only Storage write.
3. **Shared resources require moderation.** Database triggers force new or materially edited shared notes/uploads to `pending`; RLS exposes only `approved` shared rows. Authorized moderator/admin/owner roles decide through the moderation RPC. Reports change an approved item to `reported`, hiding it until review.
4. **ICAI resources are visually distinct from user uploads.** The unified library renders Phase 8 official resources with a dedicated ICAI card class, shield icon, green official styling and `ICAI Official` / `Official · Verified` badges.
