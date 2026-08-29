# Phase 0 Architecture

## Boundary

CA Progress V2 is a separate system. It intentionally has no code, database, deployment or DNS dependency on the legacy CA Progress project.

## Request path

```text
Browser
  -> Next.js App Router / Server Component
  -> domain/server service
  -> validation + authorization boundary
  -> typed Supabase client
  -> PostgreSQL RLS
```

## Frontend boundaries

- `app/(student)` — signed-in student product surface later; Phase 0 is placeholder-only.
- `app/(public)` — login/onboarding/public surfaces.
- `app/(admin)` — privileged product surface later; Phase 0 contains only a permission placeholder.
- `components/shell` — minimal Phase 0 shell only, not a permanent design system.
- No global progress context and no all-in-one tracker component.

## Backend boundaries

- `lib/supabase/browser.ts` — publishable-key browser client only.
- `lib/supabase/server.ts` — cookie-aware server client only.
- `lib/supabase/admin.ts` — server-only service-role client.
- `server/` — server/domain services that may use the above clients.
- `supabase/migrations/` — ordered schema history; all V2 schema changes must arrive here.

## Environment model

- Local: developer workstation.
- Preview/staging: Cloudflare Workers only; banner must visibly identify V2 staging.
- Production V2: intentionally not connected/cut over until Phase 13 approval.
