# CA Progress V2 — Scalable Cloudflare Worker Architecture

## Goal

Keep CA Progress on the Cloudflare Workers Free plan while allowing the product to keep growing without deleting features or repeatedly shaving bytes from unrelated code.

Cloudflare currently allows **3 MiB compressed per Worker** on the Free plan. The old single OpenNext server Worker had reached roughly 2.70 MiB compressed, so adding more features to one server bundle was no longer a sustainable architecture.

The solution is route-level server-function splitting plus private Service Bindings.

## Runtime topology

```text
Browser
  |
  v
ca-progress-v2                     public ingress / OpenNext middleware
  |-- CORE_WEB_SERVICE ----------> ca-progress-v2-web-core
  |-- ADMIN_WEB_SERVICE ---------> ca-progress-v2-web-admin
  |-- COMMUNITY_WEB_SERVICE -----> ca-progress-v2-web-community
  |-- PLANNING_WEB_SERVICE ------> ca-progress-v2-web-planning
  |-- ICAI_SYNC_SERVICE ---------> ca-progress-v2-icai-sync

private Next server Workers
  |-- BILLING_SERVICE -----------> ca-progress-v2-billing
  |-- ADMIN_OPS_SERVICE ---------> ca-progress-v2-admin-ops
  |-- ICAI_SYNC_SERVICE ---------> ca-progress-v2-icai-sync
  `-- USER_RESOURCES_R2 ---------> private user-resource bucket
```

The browser still sees one application and one URL space. Only `ca-progress-v2` is the public web ingress. The split Next server Workers use `workers_dev: false` and are reachable through Service Bindings rather than public routes.

## Why this scales better

The public Worker no longer imports the complete OpenNext default server bundle. It owns only routing/middleware, assets and small cross-cutting edge concerns.

OpenNext compiles separate server functions for feature families. Each private function gets its own Cloudflare compressed-size budget, so future features increase only the Worker that owns that route family.

If one domain grows too large, that domain can be split again without changing public URLs. For example, `community` can later become separate Community and Resources functions, or Tests can become a dedicated function, while the rest of the application remains unchanged.

## Route ownership

### Core

The default OpenNext server function owns shared/public/account routes including:

- login, logout and OAuth callbacks;
- onboarding and the Dashboard feature guide;
- Dashboard;
- Settings/Profile/Account;
- Syllabus and Tests;
- Pricing/Billing/payment routes;
- shared health/profile/academic endpoints.

### Admin

The `admin` OpenNext function owns:

- `/admin` and Admin pages;
- `/api/admin/*`.

Privileged operations remain delegated to the private `ca-progress-v2-admin-ops` Worker. The Next Admin function is therefore a presentation/authentication layer rather than the final privileged authority.

### Community / Resources

The `community` OpenNext function owns:

- Community;
- Notes;
- Resources and ICAI Resources;
- Updates;
- matching Community/Notes/Resources APIs.

### Planning / Study

The `planning` OpenNext function owns:

- Planner and Today Plan;
- Progress;
- Study;
- Goals and Calendar;
- Analytics/Forecast;
- Activity;
- subject study/progress routes;
- matching Planner/Progress/Study APIs.

## Growth rules

1. **Do not add normal product feature code to the public router.** The ingress Worker should remain middleware, routing, asset delivery and small edge concerns.
2. Add new product work to the domain Worker that owns the feature journey.
3. Keep a separate compressed-size budget for every private Next server Worker.
4. If a domain approaches its budget, split that domain again instead of deleting functionality or raising the budget to the platform hard limit.
5. Heavy privileged/background workloads belong in dedicated service Workers, not Next server bundles.
6. Shared browser JavaScript/CSS remains in Cloudflare Static Assets and does not make the ingress Worker carry the complete application server.
7. Deploy private server Workers before the public router so the router never points to a missing backend.

## Size policy

Repository budgets are deliberately below Cloudflare's hard ceiling:

- public ingress router: **0.90 MiB compressed**;
- Core Next server: **2.70 MiB compressed**;
- Admin Next server: **2.70 MiB compressed**;
- Community/Resources Next server: **2.70 MiB compressed**;
- Planning/Study Next server: **2.70 MiB compressed**;
- ICAI/Billing/Admin Operations retain their existing smaller budgets.

The long-term rule is to split a growing domain before it reaches its 2.70 MiB budget, not to consume the full 3 MiB platform limit.

## Security model

This topology does not weaken existing authorization:

- requests first pass through the existing OpenNext/Next middleware path;
- split Next server Workers reject requests without the private router marker;
- Admin APIs still authorize the signed-in account;
- the Admin Operations Worker independently checks fresh `admin_users` state;
- Parent Owner safeguards remain server/database authoritative;
- Phase 11 Razorpay amount/signature/provider reconciliation remains within the private Billing architecture;
- Guest remains a local non-account mode;
- account sign-in remains Google + LinkedIn only.

For the first split rollout, the existing Supabase runtime values are forwarded from ingress to split Next workers over private Service Bindings. This avoids requiring duplicate dashboard-managed secrets during the migration. A later hardening pass can provision server-only secrets directly on each private domain Worker and remove the forwarding without changing routes or feature code.

## Build, local runtime and deployment

`open-next.config.ts` defines the named server functions. The OpenNext build therefore produces separate `default`, `admin`, `community` and `planning` server-function bundles.

`scripts/deploy-split-web.mjs` deploys private Next server Workers first and the public router last.

`npm run cf:preview:multi` and `npm run cf:smoke` start the router, all split Next workers and the existing ICAI/Billing/Admin Operations workers together using Wrangler multi-worker development.

## Future feature example

A future Mock Test engine can begin inside Planning/Study if it is small. If it becomes a large independent module, add an OpenNext `tests` function for `/tests`, `/tests/*` and `/api/tests/*`, add a private `TESTS_WEB_SERVICE` binding, and route those paths from ingress. Existing features do not need to be removed or rewritten.
