# CA Progress Revised Phase 13 Status

## Status

**COMPLETE**

Phase 13 — **Leaderboards, anti-cheat, rewards, sharing and referrals** — is implemented, tested, deployed and verified on the working branch.

- Working branch: `phase-12-operations-admin-platform`
- Phase 12 closure baseline: `ecfd57933ab63166b38d634eae116fc20f435821`
- Validated Phase 13 runtime commit: `64ecbc2e6a572d5d6c498e539ba27c2079b29d1b`
- `main`: **not merged**
- Phase 14: **not started**

## Delivered scope

### Opt-in leaderboards

- Leaderboard participation is private-by-default (`opted_in = 0`).
- Initial categories are restricted to:
  - Overall
  - Foundation
  - Intermediate
  - Final
- Only opted-in accounts are ranked or exposed.
- Public leaderboard output is a strict whitelist of:
  - public alias
  - rank
  - XP
  - professional level
- Email addresses, internal user IDs, provider identities, session details and chapter-level private activity are not exposed.
- Users can opt out again without losing normal account or academic access.

### Anti-cheat review

Reviewable signals cover the Phase 13 launch rules:

- 15-hour / impossible timers
- repeated impossible sessions
- simultaneous/overlapping timers
- rapid chapter completion
- suspicious/fake test patterns
- delete/re-enter progress loops intended to farm XP
- excessive daily XP

Anti-cheat is evidence/review based. Flags use `pending`, `cleared` and `upheld` states. The Phase 13 service does not delete accounts, suspend normal product access, or rewrite academic progress/readiness when a flag is raised.

Review evidence is retained while the account exists. Privileged review actions use the existing application-role authorization boundary.

### Bounded subscription rewards

Monthly Overall leaderboard settlement is bounded to the roadmap reward positions:

- Rank #1 → Premium-equivalent configured paid plan for the following month
- Rank #2 → Pro-equivalent configured paid plan for the following month
- Rank #3 → Pro-equivalent configured paid plan for the following month
- Rank #4+ → no leaderboard subscription reward

Reward grants are idempotent per competition period/user and per competition period/rank.

Rewards are implemented as a temporary entitlement overlay over the existing subscription-plan catalog. Phase 13 does **not** insert synthetic billing subscriptions, rewrite payment history, alter prices, or create permanent paid-plan state.

If suspicious activity is unresolved or upheld, the leaderboard reward is withheld while the user's normal account remains usable. When review is cleared and no active suspicious flags remain, the bounded reward becomes eligible again for the remaining reward window.

### Activation-based referrals

- Every referrer has a shareable referral code and referral link.
- Referral links only prefill the code; the referred user still explicitly applies it.
- Signup alone grants no XP or subscription reward.
- Self-referral is rejected.
- A referred account can be attributed to only one referrer.
- Activation requires **3 distinct qualifying study sessions**.
- Qualifying sessions use the existing meaningful-study floor (20+ minutes) and exclude impossible 15-hour sessions.
- Successful activation grants the referrer exactly **+200 XP once**.
- Referral XP is stored in a separate immutable bonus ledger so Phase 12's immutable XP ledger constraints remain unchanged.
- Replay/race-safe unique keys prevent duplicate activation rewards.

### Share cards

User-initiated share cards cover:

- weekly preparation progress
- milestones, including the explicit 100-hour meaningful-study milestone
- syllabus completion
- leaderboard rank for opted-in users

Available actions:

- WhatsApp
- Instagram/native share where supported
- PNG download

The share-card payload is a privacy whitelist and does not include account IDs, email addresses or raw activity records.

## Data model

Product migration:

`d1/migrations/0023_product_phase13_leaderboards_rewards_referrals.sql`

Phase 13 adds:

- `leaderboard_profiles`
- `gamification_bonus_ledger`
- `referral_codes`
- `referrals`
- `anti_cheat_flags`
- `leaderboard_reward_grants`

The migration is additive and does not alter the canonical academic progress, study-session or test-history tables.

## Runtime and API boundaries

Student/private APIs:

- `/api/gamification/phase13`
- `/api/leaderboard`

Privileged review/settlement API:

- `/api/admin/gamification`

Authenticated account endpoints use private/no-store response semantics. Public-facing leaderboard data is sanitized before serialization.

Billing integration remains behind the existing billing/entitlement boundary. Academic progress/readiness remains authoritative in the existing academic services and is not inferred from leaderboard rank, referral state, rewards or anti-cheat status.

## Test coverage

Added dedicated Phase 13 suites:

- `tests/product-phase13-leaderboards-rewards-referrals.test.mjs`
- `tests/product-phase13-privacy-abuse.test.mjs`

They cover, among other invariants:

- opt-in/private-by-default leaderboard visibility
- category restrictions
- public-field whitelisting
- no private identifier leakage
- rank-bounded monthly rewards
- following-month reward windows
- reward idempotency
- temporary anti-cheat withholding
- non-destructive anti-cheat handling
- referral self-attribution rejection
- no signup-only reward
- 3-session activation threshold
- impossible-session exclusion
- exactly one +200 XP activation award
- immutable/replay-safe bonus history
- user-initiated privacy-safe share cards
- 100-hour milestone support
- referral-link prefill without automatic attribution
- preservation of Phase 12 XP constraints
- isolation from Phase 14 export/backup work

## Validation evidence

### V2 CI

Run: `34063188458`

**PASS** on validated runtime commit `64ecbc2e6a572d5d6c498e539ba27c2079b29d1b`.

Passed gates:

- permanent Supabase retirement scanner
- TypeScript typecheck
- ESLint with zero warnings allowed
- retained D1 hot-query index validation
- Next.js production build
- OpenNext Cloudflare build
- production Worker dry-runs
- Cloudflare SSR route smoke
- complete repository-wide tests
- final Supabase retirement rescan

### Supabase Retirement Permanent Closure

Run: `34063188456`

**PASS** on the same validated runtime commit.

The independent closure workflow passed:

- retired runtime/migration enforcement
- retirement regression contract
- typecheck
- lint
- D1 index validation
- repository tests
- Next.js build
- OpenNext/Worker checks
- SSR smoke
- final retirement rescan

### Cloudflare deployment

Run: `34063188469`

**PASS** on validated runtime commit `64ecbc2e6a572d5d6c498e539ba27c2079b29d1b`.

The deployment workflow successfully completed:

- all pre-deploy quality gates
- pre-deploy evidence capture
- remote additive Product D1 migration application
- ICAI service deployment
- Billing service deployment
- web Worker secret verification
- web runtime deployment
- post-deploy smoke verification with automated rollback protection
- deployment evidence upload

### D1 verification

Retained D1 database:

- Name: `ca-progress-v2-phase4-shadow`
- Database ID: `6f002cbe-fe40-4d1b-9cf4-df6faaf52350`

Remote evidence confirms schema migration `0023` is recorded as:

> `product phase 13 opt-in leaderboards reviewable anti-cheat bounded rewards and activated referrals`

Remote queries successfully resolved all Phase 13 tables after deployment:

- `leaderboard_profiles`
- `gamification_bonus_ledger`
- `referrals`
- `anti_cheat_flags`
- `leaderboard_reward_grants`

The deployment verification completed successfully, including its D1 integrity/foreign-key check path.

### Latest verified web Worker deployment

- Deployment ID: `e890da54-1f4d-46b5-a967-2751e3a66d74`
- Version ID: `d52f74e0-7b83-4e7f-8977-9f052ec5395e`
- Deployment timestamp: `2026-09-06T22:12:52.900556Z`

## Definition-of-done review

| Requirement | Result |
| --- | --- |
| Leaderboards are opt-in | PASS |
| Only intended initial leaderboard categories launch | PASS |
| Leaderboard data is privacy-safe | PASS |
| Anti-cheat signals are reviewable | PASS |
| Suspicious users keep normal account access | PASS |
| Suspicious users are ineligible for rewards pending verification | PASS |
| #1 reward is bounded to next month's Premium-equivalent plan | PASS |
| #2–#3 rewards are bounded to next month's Pro-equivalent plan | PASS |
| Reward settlement is idempotent and rank-bounded | PASS |
| Rewards do not rewrite billing history or prices | PASS |
| Share cards support weekly/milestone/syllabus/rank sharing | PASS |
| WhatsApp / Instagram / download actions exist | PASS |
| 100-hour study milestone is supported | PASS |
| Referral link/code flow exists | PASS |
| Signup alone does not earn reward | PASS |
| Three qualifying study sessions activate referral | PASS |
| Referral activation grants +200 XP exactly once | PASS |
| Self-referral / duplicate attribution / replay abuse are blocked | PASS |
| Academic progress/readiness is not mutated by Phase 13 | PASS |
| Privacy and abuse-resistance tests pass | PASS |
| Full repository CI passes | PASS |
| Cloudflare migration/deployment verification passes | PASS |
| Supabase retirement remains closed | PASS |
| Phase 14 remains untouched | PASS |

## Closure

Phase 13 is complete and closed on `phase-12-operations-admin-platform`.

No Phase 14 implementation has been started and no merge to `main` has been performed.
