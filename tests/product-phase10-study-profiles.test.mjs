import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PRIVATE_STUDY_PROFILE_DEFAULTS,
  canViewStudyProfileScope,
  serializeStudyProfile,
} from "../lib/profile/study-profile-policy.mjs";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const source = {
  userId: "student-1",
  displayName: "Study Student",
  publicBio: "Preparing consistently.",
  caLevel: "intermediate",
  attemptKey: "may-2027",
  progress: { firstCoveragePercent: 60, revisionReadinessPercent: 35, testingReadinessPercent: 20 },
  streak: { currentStreakDays: 7, activeDaysLast14: 10 },
};

test("Product Phase 10 migration is private by default and buddy access is an explicit ACL", () => {
  const migration = read("d1/migrations/0020_product_phase10_study_profiles.sql");
  assert.match(migration, /profile_visibility TEXT NOT NULL DEFAULT 'private'/);
  assert.match(migration, /progress_visibility TEXT NOT NULL DEFAULT 'private'/);
  assert.match(migration, /streak_visibility TEXT NOT NULL DEFAULT 'private'/);
  assert.match(migration, /show_level INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /show_attempt INTEGER NOT NULL DEFAULT 0/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS study_profile_buddies/);
  assert.match(migration, /PRIMARY KEY\(owner_user_id,buddy_user_id\)/);
  assert.match(migration, /privacy ACL, not a discovery\/follow graph/i);
});

test("Product Phase 10 private profile blocks public and buddy viewers while owner retains access", () => {
  assert.equal(PRIVATE_STUDY_PROFILE_DEFAULTS.profileVisibility, "private");
  assert.equal(canViewStudyProfileScope("private", "public"), false);
  assert.equal(canViewStudyProfileScope("private", "buddy"), false);
  assert.equal(canViewStudyProfileScope("private", "owner"), true);
  assert.equal(serializeStudyProfile({ source, settings: undefined, relationship: "public" }), null);
  assert.equal(serializeStudyProfile({ source, settings: PRIVATE_STUDY_PROFILE_DEFAULTS, relationship: "buddy" }), null);
  assert.ok(serializeStudyProfile({ source, settings: PRIVATE_STUDY_PROFILE_DEFAULTS, relationship: "owner" }));
});

test("Product Phase 10 public profile exposes only fields individually allowed for public visibility", () => {
  const profile = serializeStudyProfile({
    source,
    relationship: "public",
    settings: {
      profileVisibility: "public",
      progressVisibility: "public",
      streakVisibility: "private",
      showLevel: true,
      showAttempt: false,
    },
  });
  assert.equal(profile.displayName, "Study Student");
  assert.equal(profile.caLevel, "intermediate");
  assert.deepEqual(profile.progress, source.progress);
  assert.equal(Object.hasOwn(profile, "attemptKey"), false);
  assert.equal(Object.hasOwn(profile, "streak"), false);
});

test("Product Phase 10 buddy-visible profile is unavailable publicly and visible to an explicit buddy", () => {
  const settings = {
    profileVisibility: "buddies",
    progressVisibility: "buddies",
    streakVisibility: "buddies",
    showLevel: true,
    showAttempt: true,
  };
  assert.equal(serializeStudyProfile({ source, settings, relationship: "public" }), null);
  const buddy = serializeStudyProfile({ source, settings, relationship: "buddy" });
  assert.equal(buddy.relationship, "buddy");
  assert.equal(buddy.caLevel, source.caLevel);
  assert.equal(buddy.attemptKey, source.attemptKey);
  assert.deepEqual(buddy.progress, source.progress);
  assert.deepEqual(buddy.streak, source.streak);
});

test("Product Phase 10 hidden fields are absent from the serialized response rather than nulled", () => {
  const profile = serializeStudyProfile({
    source,
    relationship: "public",
    settings: {
      profileVisibility: "public",
      progressVisibility: "private",
      streakVisibility: "private",
      showLevel: false,
      showAttempt: false,
    },
  });
  for (const key of ["caLevel", "attemptKey", "progress", "streak"]) assert.equal(Object.hasOwn(profile, key), false, `${key} must be omitted`);
  assert.deepEqual(Object.keys(profile).sort(), ["displayName", "publicBio", "relationship", "userId"].sort());
});

test("Product Phase 10 server service does not query sensitive scores, notes, private reflections, or avatar object keys", () => {
  const service = read("lib/profile/study-profile.ts");
  assert.match(service, /study_profile_buddies/);
  assert.match(service, /chapter_progress/);
  assert.match(service, /study_sessions/);
  assert.match(service, /canViewStudyProfileScope\(settings\.profileVisibility, relationship\)/);
  assert.doesNotMatch(service, /test_attempts|marks_scored|marks_total|test_attempt_mistakes/i);
  assert.doesNotMatch(service, /FROM\s+notes|JOIN\s+notes|body_html|body_text|note_revision_metadata/i);
  assert.doesNotMatch(service, /study_session_phase3|understanding_score|focus_score|reflection/i);
  assert.doesNotMatch(service, /avatar_url|object_key|answer_sheet|checked_paper|suggested_answer/i);
});

test("Product Phase 10 API enforces centralized server checks, same-origin writes, and viewer-varying no-store responses", () => {
  const ownerRoute = read("app/api/study-profile/route.ts");
  const buddyRoute = read("app/api/study-profile/buddies/route.ts");
  const viewerRoute = read("app/api/study-profile/[userId]/route.ts");
  assert.match(ownerRoute, /optionalUser/);
  assert.match(ownerRoute, /assertSameOriginMutation/);
  assert.match(ownerRoute, /saveOwnerStudyProfileSettings/);
  assert.match(buddyRoute, /optionalUser/);
  assert.match(buddyRoute, /assertSameOriginMutation/);
  assert.match(buddyRoute, /grantStudyProfileBuddy/);
  assert.match(viewerRoute, /getStudyProfileForViewer/);
  assert.match(viewerRoute, /viewer\?\.id \?\? null/);
  assert.match(viewerRoute, /Study profile unavailable\./);
  for (const route of [ownerRoute, buddyRoute, viewerRoute]) assert.match(route, /private, no-store/);
});

test("Product Phase 10 owner UI exposes granular visibility and exact-ID buddy grants without discovery", () => {
  const component = read("components/auth/study-profile-privacy.tsx");
  const settingsPage = read("app/(student)/settings/profile/page.tsx");
  const viewerPage = read("app/(student)/study-profile/[userId]/page.tsx");
  assert.match(component, /Profile visibility/);
  assert.match(component, /Progress visibility/);
  assert.match(component, /Streak & consistency visibility/);
  assert.match(component, /Show my CA level/);
  assert.match(component, /Show my target attempt/);
  assert.match(component, /Buddy user ID/);
  assert.match(component, /Exact user ID/);
  assert.doesNotMatch(component, /search users|discover people|suggested buddies/i);
  assert.match(settingsPage, /getOwnerStudyProfileSettings/);
  assert.match(settingsPage, /StudyProfilePrivacy/);
  assert.match(viewerPage, /getStudyProfileForViewer/);
});

test("Product Phase 10 deployment applies migration 0020 and Product Phase 11 is not started", () => {
  const workflow = read(".github/workflows/deploy-staging.yml");
  assert.match(workflow, /0020_product_phase10_study_profiles\.sql/);
  assert.match(workflow, /'0020'/);
  assert.match(workflow, /phase10_study_profiles/);
  assert.match(workflow, /phase10_study_profile_buddies/);
  assert.equal(existsSync(join(root, "docs/CA_PROGRESS_PRODUCT_PHASE11_STATUS.md")), false);
});
