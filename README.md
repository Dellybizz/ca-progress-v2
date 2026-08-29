# CA Progress V2 — Phase 0

Fresh, isolated foundation for CA Progress V2. The legacy `ca-progress` repository and live application are **read-only reference only** and are not a deployment target for this project.

## Phase 0 scope implemented

- Next.js App Router + TypeScript foundation.
- Separate route groups for student, public/auth, and admin surfaces.
- Minimal responsive V2 staging shell; no copied legacy UI.
- Explicit 360/375/390/430px mobile layout contracts plus desktop shell.
- Separate browser, server and service-role Supabase clients.
- Ordered Supabase migrations with RLS from migration 1.
- Structured JSON logger with sensitive-field redaction.
- Minimal `/api/health` endpoint.
- Cloudflare Workers/OpenNext deployment configuration only.
- CI gates for typecheck, lint, smoke tests and build.

## Quick start

```bash
cp .env.example .env.local
npm install
npm run dev
```

Then open `http://localhost:3000/dashboard`.

## Quality gates

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run cf:check
```

## Cloudflare staging

This project is configured for Cloudflare Workers with OpenNext. See `docs/CLOUDFLARE_STAGING.md` before deploying.

## Supabase V2

Create a new V2 Supabase project, then apply `supabase/migrations` in order. See `docs/SUPABASE_V2_SETUP.md`.

## Guardrail

Do not connect this project to the current CA Progress production database or production domain during Phases 0–12.
