# Cloudflare-only staging setup

CA Progress V2 uses Cloudflare Workers via OpenNext. No Vercel deployment configuration exists.

## Current staging deployment

- Worker name: `ca-progress-v2`
- Staging URL: `https://ca-progress-v2.habeebaasif622.workers.dev`
- Production branch for staging: `main`
- Root directory: `/`
- Build command: `npm run cf:build`
- Deploy command: `npx wrangler deploy`

## Cloudflare build variables

Configure these in the Cloudflare connected build:

- `NODE_VERSION=22.13.0`
- `NEXT_PUBLIC_APP_ENV=staging`
- `NEXT_PUBLIC_SUPABASE_URL` — isolated V2 project only
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — isolated V2 project only

`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_ENV` and `NEXT_PUBLIC_APP_VERSION` also have staging defaults in `wrangler.jsonc`.

## Server-only secret

`SUPABASE_SERVICE_ROLE_KEY` must never be exposed through a `NEXT_PUBLIC_` variable or committed to source. Add it as a Cloudflare Worker secret only when a server-only Phase requires it.

Example CLI setup:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Phase 0 health checks do not require the service-role key unless database health logging is explicitly enabled later.

## Optional GitHub Actions manual deploy

The repository includes `.github/workflows/deploy-staging.yml` as an optional manual deployment path. If used, configure GitHub environment secrets for:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The primary staging deployment currently uses Cloudflare's direct GitHub integration.

## Local Cloudflare preview

```bash
npm install
npm run cf:preview
```

## CLI deploy

```bash
npm run cf:deploy
```

## DNS guardrail

Use the generated `workers.dev` staging hostname or a dedicated future staging hostname. Do not attach the existing live CA Progress production hostname during Phase 0.
