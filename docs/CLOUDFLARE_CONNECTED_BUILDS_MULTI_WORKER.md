# Cloudflare Connected Builds + Multi-Worker deployment

CA Progress V2 uses one connected public Worker (`ca-progress-v2`) plus multiple private Workers deployed from the same repository.

Cloudflare Workers Builds injects `WRANGLER_CI_OVERRIDE_NAME` so normal connected builds always deploy to the connected Worker name. That behavior is correct for a single Worker but would rename every child `wrangler deploy -c ...` invocation to `ca-progress-v2` in this repository.

For CA Progress V2, all multi-Worker deployment helpers explicitly remove only `WRANGLER_CI_OVERRIDE_NAME` from child Wrangler processes. Each private Worker therefore uses the `name` declared in its own Wrangler config.

Deployment order remains dependency-safe:

1. ICAI Sync
2. Billing
3. Admin Operations
4. Core Next Worker
5. Admin Next Worker
6. Community Next Worker
7. Planning Next Worker
8. Public ingress Worker

Do not remove the override-sanitization unless deployment is moved entirely out of Cloudflare Workers Builds.
