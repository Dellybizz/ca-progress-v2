# CA Progress V2 — Cloudflare Worker Architecture

## Goal

Keep the user-facing Next.js/OpenNext Worker comfortably below Cloudflare bundle limits as later V2 phases are added, without weakening RLS, server authorization, R2 privacy or existing feature behavior.

## Current topology

```text
Browser
  |
  v
ca-progress-v2 (Next.js/OpenNext web Worker)
  |-- Supabase V2 / RLS
  |-- USER_RESOURCES_R2 (private Phase 7 files)
  |
  `-- ICAI_SYNC_SERVICE (Cloudflare Service Binding)
          |
          v
      ca-progress-v2-icai-sync
      private, workers_dev=false
          |
          v
      Supabase V2 operational ICAI tables/RPCs
```

The web Worker owns product routes, SSR/RSC, authenticated UI actions and thin API/BFF endpoints. Heavy background processing belongs in domain Workers when it would otherwise make every web request carry unnecessary code.

## Phase 8 extraction

The Phase 8 parser/synchronization engine is in `workers/icai-sync/`. The public/admin application keeps the existing `runIcaiSync()` contract in `lib/icai/sync.ts`, but that module is now a thin client for the `ICAI_SYNC_SERVICE` binding.

The scheduled handler in `custom-worker.ts` also calls the service directly. This preserves the existing daily schedule while keeping parser/backoff/source-processing code out of the OpenNext server bundle.

The internal Worker has no `workers.dev` endpoint and no public routes. The target Worker is deployed before the web Worker so the service binding resolves safely.

## Bundle budgets

`npm run cf:check` builds OpenNext and enforces repository budgets using Wrangler dry-run output:

- web Worker: **2.70 MiB compressed maximum**
- ICAI sync Worker: **1.50 MiB compressed maximum**

These are repository budgets, intentionally lower than platform hard limits. A phase that breaks a budget should first trim unused code or extract an appropriate backend domain instead of simply consuming all available headroom.

## Deployment

`npm run cf:deploy` performs:

1. OpenNext web build and guarded unused-OG stripping;
2. deployment of `ca-progress-v2-icai-sync`;
3. deployment of `ca-progress-v2` with its service binding.

For local Cloudflare multi-worker testing use `npm run cf:preview:multi`.

## Future-phase rule

Do not create a Worker for every small feature. Extract only natural heavy or security-sensitive domains. Payment/webhook processing is a likely future candidate when its assigned phase is implemented; this document does not implement or start that later-phase functionality.
