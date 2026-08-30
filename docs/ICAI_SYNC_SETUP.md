# Phase 8 ICAI synchronization setup

## Boundary
This document applies only to CA Progress V2 and the isolated V2 Supabase/Cloudflare staging environment. Never use the legacy CA Progress Supabase project or overwrite the legacy live site.

## Runtime architecture
Cloudflare Cron Trigger (`30 0 * * *`, UTC = 06:00 IST) invokes the custom OpenNext Worker `scheduled()` handler. The handler calls the protected internal `/api/cron/icai-sync` route, which runs the service-role synchronization engine. The job is independent of student traffic.

Each configured official ICAI source is fetched with timeout, conditional ETag/Last-Modified headers, retry/backoff and a per-source request interval. Metadata is canonicalized and SHA-256 hashed before comparison. A failed source records source health/run failure data without replacing the last verified resource/event dataset.

## Required Cloudflare Worker secrets
Configure these on Worker `ca-progress-v2`:

- `SUPABASE_SERVICE_ROLE_KEY` — service-role key from **V2 Supabase project `wgdhpzbgyjqjlgntibqg` only**.
- `ICAI_CRON_SECRET` — a newly generated strong random server-only secret used to authenticate the scheduled internal request.

Do not prefix either value with `NEXT_PUBLIC_`, do not commit them, and do not paste them into issue/PR/chat screenshots.

Existing public V2 Supabase configuration remains required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Optional variables:
- `ICAI_SYNC_ENABLED=true`
- `ICAI_SYNC_USER_AGENT=CA Progress V2 Official ICAI Monitor/phase8`

## Source and copyright policy
Only approved `icai.org`/subdomain sources are fetched. Phase 8 stores resource titles, classification, dates when safely detected, provenance, hashes, parser versions and official links. It does not copy ICAI PDF/study-material bodies into CA Progress storage.

## High-impact changes
Exam date/time changes are not silently applied. They create `icai_change_events` + `icai_review_queue` records. The current verified date/time remains unchanged until an admin/owner/parent owner approves the review in `/admin/icai-sync`.

## Deployment check
After the Phase 8 code is merged and the two required Worker secrets exist, manually run the existing `Deploy V2 Staging to Cloudflare` workflow. Confirm `/updates`, `/resources/icai`, `/admin/icai-sync` (authorized account) and that the Worker shows the daily Cron Trigger.
