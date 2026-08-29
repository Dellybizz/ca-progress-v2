# Supabase V2 Setup

## 1. Create a new project

Create a dedicated staging project such as `ca-progress-v2-staging`. Do not reuse the current CA Progress production project.

## 2. Configure local values

Copy `.env.example` to `.env.local` and set:

```text
NEXT_PUBLIC_SUPABASE_URL=<new V2 project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<new V2 publishable key>
SUPABASE_SERVICE_ROLE_KEY=<new V2 server-only service role key>
```

## 3. Apply ordered migrations

With the Supabase CLI:

```bash
supabase link --project-ref <V2_PROJECT_REF>
supabase db push
```

Migration 1 creates:

- `profiles` stub
- `app_settings`
- `system_health_log`
- RLS policies and the updated-at trigger

## 4. RLS contract

- `profiles`: authenticated users can read/create/update their own stub profile only.
- `app_settings`: anonymous/authenticated users can read rows explicitly marked public; no client write policies exist.
- `system_health_log`: no client policies exist; server/service-role access only.

The service role is never imported into a browser module.
