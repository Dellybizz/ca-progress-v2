# Cloudflare-only staging setup

CA Progress V2 uses Cloudflare Workers. There is no alternate deployment target configured.

## Required Cloudflare values

Create a Cloudflare API token capable of Workers Scripts edits and obtain the account ID. For GitHub Actions use:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `NEXT_PUBLIC_SUPABASE_URL` — V2 staging project only
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — V2 staging project only

The service-role key must remain server-only. Add it to the staging Worker as a secret:

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

Do not store that value in source code or a public runtime variable.

## Local Cloudflare preview

```bash
npm install
npm run cf:preview
```

## Deploy staging

```bash
npm run cf:deploy
```

The configured Worker name is `ca-progress-v2-staging`.

## DNS guardrail

Use a dedicated staging hostname or the generated `workers.dev` hostname. Do **not** attach the existing live CA Progress hostname during Phase 0.

## Current platform guidance

OpenNext is used here because the phased plan requires a real Next.js App Router codebase and later phases need Server Components, Route Handlers and Server Actions. Cloudflare Workers remains the sole deployment platform.
