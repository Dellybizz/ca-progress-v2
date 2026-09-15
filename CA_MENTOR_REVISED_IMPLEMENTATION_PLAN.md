# CA Progress V2 — Revised CA Mentor / Think Engine Plan

Status: **PLANNING UPDATED — Phase 3 implementation not started**

This plan incorporates the CA Mentor Think Engine prompts and the product feature brief in
`Pasted text(20260902-212345).txt`.

## Product north star

CA Progress is the operating system for CA preparation:

**Plan → Study → Track → Test → Review → Revise → Improve → Share → Repeat**

The primary product questions are:

1. What should I study today?
2. How much have I actually completed?
3. What needs revision or testing?
4. Am I on track for my attempt?
5. How consistent am I against my own goals?

ICAI remains authoritative for syllabus, amendments, RTP, MTP, question papers and exam
structure. External sources can influence strategy only with explicit provenance and confidence.

## Non-negotiable architecture rules

- Preserve all current CA Progress functionality and existing progress history.
- Use one canonical academic identity for every subject, chapter, unit, AS, test, note and doubt.
- Personalised predictions, weakness models, pace estimates, forecasts and comparisons stay
  locked until each metric independently meets activity and elapsed-time gates.
- Preprocessed/public intelligence may be shown immediately; it must never be presented as
  personal insight.
- Test attempts are append-only; repeated tests never overwrite earlier attempts.
- Scores and private notes are private by default.
- Community verification increases credibility display only; it never makes an answer
  automatically correct.
- Third-party and community evidence is zero-trust until reviewed and weighted.
- Future rankings and leaderboards require anti-cheating, privacy and verification controls;
  no ranking UI is allowed before its dedicated phase.
- Every feature needs loading, empty, error, permission and mobile-responsive states.
- Stop after each phase and verify its definition of done before starting the next.

## Revised phase map

### Phase 1 — Mentor Intelligence Foundation

Already implemented on the working branch. Keep its source/evidence, model-version,
confidence, provenance and metric-specific eligibility contracts.

Add planning constraints for:

- study sessions and actual-duration events;
- test attempts and mistake classifications;
- notes, files and chapter links;
- doubts and community answer provenance;
- goals, streaks, XP and notification events;
- privacy visibility and buddy-sharing permissions.

These are contracts only where required for future compatibility; no new ranking UI.

### Phase 2 — Canonical Academic Catalog

Already represented by the existing academic catalog work. Extend mappings so every future
study session, test, note, file, doubt, community post, planner task and intelligence item
references stable course/group/subject/chapter/unit/AS IDs.

Support aliases, applicability windows, syllabus versioning and predecessor/successor
relationships without deleting historical progress.

### Phase 3 — Automatic ICAI Attempt Discovery **(expanded before implementation)**

Build the versioned ICAI source registry and discovery service:

- detect future attempts and register study material, syllabus notices, RTP, MTP I, MTP II,
  question papers, suggested answers, MCQs, amendments/statutory updates and BoS material;
- associate course, group, subject/paper, attempt, publication date and applicability window;
- make discovery scheduled and manually re-runnable by an authorised admin;
- use idempotency keys, duplicate detection, retries, processing logs and failure states;
- route unknown or ambiguous material to review/unclassified state; never guess;
- preserve immutable historical source records and versions.

Phase 3 must also publish stable source/event contracts needed by later product features:

- source-to-academic-node references for Chapter Hub evidence;
- attempt identifiers for Today, planner and countdown;
- source lineage fields that can later explain Exam Intelligence and recommendations;
- attachment metadata contract for future test papers, answer sheets, notes and community
  saves, without implementing the editor or upload UI yet;
- notification/event names for new official material, without sending broad notifications yet.

Phase 3 does **not** implement scoring, scraping of third-party sources, personalised forecasts,
study timer UI, tests UI, notes editor, community redesign, buddies, XP, leaderboards or
subscription enforcement.

### Phase 4 — ICAI Document Processing and Topic Mapping

Process registered ICAI documents into traceable evidence mapped to canonical academic nodes.
Support multi-topic questions, extraction confidence, mapping confidence and review queues.
This powers the future Chapter Hub and test-review evidence views.

### Phase 5 — Attempt-Specific Exam Intelligence

Score official weightage, current RTP/MTP signals, amendments, PYQ recurrence and MCQ/
descriptive recurrence separately. Produce explainable 0–100 importance with confidence and
model version. Never make guaranteed-question claims.

### Phase 6 — Baseline Learning and Effort Intelligence

Estimate first completion, Revision 1, Revision 2, Test 1 and Test 2 effort from structured
complexity signals. Keep it clearly separate from personalised data.

### Phase 7 — Study Sessions and Chapter Hub

Build the connected Chapter Hub and fast study-session workflow:

- start/finish/actual duration, pauses, chapter/task and completion state;
- post-session understanding, focus and optional doubt capture;
- chapter view for progress, study time, tests, notes, saved answers, doubts and files;
- retain the current progression model: Completion → Revision 1 → Revision 2 and
  Completion → Test 1 → Test 2.

### Phase 8 — Tests, Test Archive and Mistake Journal

Build linked tests where saving marks automatically completes the selected test stage.
Store score, maximum marks, percentage, duration, dates, chapter, subject and attempt.
Support append-only repeated attempts, improvement history, optional question paper/answer
sheet/checked paper/suggested-answer attachments, and mistake categories.

### Phase 9 — Notes and Revision Knowledge

Build chapter-linked revision notes with headings, lists, checklists, highlights, links,
images, PDFs, tables and simple formatting. Add Table Maker. Allow a saved Community answer
to become a note while retaining author, question, date and discussion link.

### Phase 10 — Today Home, Planner and Goals

Make Today the primary student home. Show attempt countdown, planned/actual time, tasks,
progress, rearrange/add-task actions and full planner access. Add calendar, goals and
configurable stage priorities using only eligible personal metrics.

### Phase 11 — Community and Doubts

Keep structured General, Foundation, Intermediate, Final and subject-specific Doubt
channels. Study-session doubts inherit academic tags automatically. Add answers,
notifications, saved answers and moderation states.

### Phase 12 — Verification, Profiles and Privacy

Add team-administered verification badges, verified/high-scorer filters, optional public
study profiles, private-by-default scores/notes and granular visibility controls.

### Phase 13 — Study Buddies and Shared Accountability

Add buddy requests, acceptance, per-field sharing permissions, shared goals, buddy dashboard,
encourage/nudge actions and optional shared study sessions. Do not expose private data by
default.

### Phase 14 — Forecasts and Personal Analytics

Add on-track forecasts, consistency, study-time and weakness analytics only after their
metric-specific eligibility gates are met. Show confidence, observation window and
explanations. Never show fabricated cold-start personalisation.

### Phase 15 — XP, Streaks, Achievements and Share Cards

Add XP, levels, achievements, streaks, shareable progress cards and referrals. XP must never
control academic completion, revision unlocks or test completion.

### Phase 16 — Rankings and Anti-Cheating

Only after verification, privacy and sufficient data are ready: monthly leaderboards,
verified cohorts, anti-cheating rules, audit trails and reward eligibility. Ranking is
optional and must not affect academic recommendations.

### Phase 17 — Notifications, Export and Backup

Add event-driven reminders, revision/test prompts, official-material notifications,
in-app preferences, export and backup/restore with privacy controls.

### Phase 18 — Plans, Storage and Retention

Apply Free/Pro/Premium entitlements only from the approved pricing and storage decision.
Meter files, notes, attachments, notifications and intelligence access without locking core
academic history. Validate the retention loop and billing boundaries.

## Phase 3 definition of done

- Future ICAI attempt material can be registered without app-code changes.
- All listed ICAI source types have registry support.
- Re-running discovery creates no duplicates.
- Historical records are immutable/versioned.
- Failures, retries and ambiguous material are traceable.
- Every registered source can carry applicability and canonical academic references.
- Contracts exist for later Chapter Hub, Today, tests, notes/files, doubts and explanations.
- No third-party crawling, scoring, ranking UI or fake personalisation is implemented.
- Migrations, authorization checks and idempotency tests pass.
- Current CA Progress behaviour remains intact.
- Phase 3 status and implementation record are updated only after all tests pass.
- Do not start Phase 4 automatically.
