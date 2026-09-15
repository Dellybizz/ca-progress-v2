# Supabase Retirement Phase 7 Status

> This records Phase 7 of the Supabase-retirement plan. It is the final external cleanup phase after the Cloudflare-only runtime and repository retirement were completed in Phases 1–6.

## Status

**COMPLETE** — 6 September 2026 (Asia/Kolkata).

Phase 7 closes the external Supabase retirement boundary for CA Progress V2. The legacy Supabase project is no longer accessible, stale Supabase GitHub environment secrets were removed through the GitHub dashboard, and the surviving application/runtime configuration remains Cloudflare-only.

## Retirement target

The retired project was:

- Name: `CA Progress V2`
- Project ref: `wgdhpzbgyjqjlgntibqg`
- Region: `ap-south-1`

Before any destructive external action, the project was verified against the retained Phase 3 retirement backup signature:

- Auth users: **7**
- Storage objects: **0**
- Development branches: **0**
- Edge Functions: **0**

This matched the final migration/retirement evidence and confirmed the correct project before shutdown.

## External Supabase retirement

The target project was first disabled through the connected Supabase administration API and reached final state `INACTIVE`.

Permanent deletion was then completed manually in the Supabase dashboard because the connected Supabase tool exposes pause/restore but not project deletion.

Post-deletion verification from the connected Supabase account:

- the organization `Web Portal` (`oyflrtyblwiseufzhpwr`) remains accessible
- project listing returns **0 accessible projects**
- the retired project ref `wgdhpzbgyjqjlgntibqg` is no longer accessible through project administration

This is consistent with the retired CA Progress V2 Supabase project no longer being available to the connected account.

No data was copied back into D1 and no Cloudflare/D1-native rows were deleted or rewritten during Phase 7.

## GitHub secret cleanup

The final `v2-staging` environment was reviewed in the GitHub dashboard.

The stale retirement-era secrets identified and removed were:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SMOKE_MODERATOR_AUTH_COOKIE`
- `SMOKE_MUTATION_AUTH_COOKIE`

The current secrets retained for the Cloudflare application are the Cloudflare account/token, Cloudflare auth-session secret, Google OAuth credentials, LinkedIn OIDC credentials, and Razorpay credentials.

The connected GitHub integration intentionally does not expose Actions secret enumeration, so the deletion itself is recorded from the completed dashboard action. Independently, all surviving workflow source remains free of Supabase secret names and Supabase project configuration.

## Surviving repository/runtime boundary

The surviving workflows are:

- `.github/workflows/ci.yml`
- `.github/workflows/deploy-staging.yml`
- `.github/workflows/supabase-retirement-closure.yml`

They contain no active Supabase SDK, URL, service-role key, anon/publishable key, project ref, database password, or migration-token dependency.

The permanent repository retirement guard remains active and prevents reintroduction of:

- Supabase SDK packages
- Supabase runtime environment names
- `lib/supabase/*` runtime modules
- Supabase compatibility modules/factories
- retired migration/cutover scripts
- retired Supabase migration paths

## Preserved Cloudflare production state

Phase 7 did **not** modify:

- Cloudflare D1 database `ca-progress-v2-phase4-shadow`
- legitimate D1-native rows
- R2 application objects
- Cloudflare production Workers and service bindings
- retained `d1/migrations/` history
- Phase 3/4/5/6 retirement evidence
- the final Phase 3 logical backup record
- `main`

## Unrelated Supabase project observation

Earlier in Phase 7 the connected account also exposed a separate project:

- `ca project` — project ref `nmoxztfqjtcpmckjwvfg`

No ChatGPT action was performed against that project. At final post-deletion verification, however, the Supabase project listing returned zero accessible projects and this older ref was also no longer accessible through the connector.

That observation is outside the CA Progress V2 retirement target. If the older project was expected to remain active, its account/project status should be reviewed separately in the Supabase dashboard.

## Exit decision

**Supabase Retirement Phase 7: COMPLETE.**

The CA Progress V2 migration/retirement program is now closed end-to-end:

- Phase 1 — complete
- Phase 2 — complete
- Phase 3 — complete
- Phase 4 — complete
- Phase 5 — complete
- Phase 6 — complete
- Phase 7 — complete

The active CA Progress V2 architecture is Cloudflare-only for authentication/session handling, D1 application data, R2 file storage, Workers/services, queues/background processing, and deployment validation.

No merge to `main` was performed.