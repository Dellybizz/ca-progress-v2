import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");

test("buddy-visible Study Profile access resolves only from accepted Phase 11 relationships", () => {
  const service = read("lib/profile/study-profile.ts");
  const resolver = service.match(/async function relationshipForViewer[\s\S]*?\n}\n\nasync function acceptedStudyBuddyIds/)?.[0] ?? "";
  assert.match(resolver, /FROM study_buddy_relationships r/);
  assert.match(resolver, /r\.status='accepted'/);
  assert.match(resolver, /study_buddy_safety/);
  assert.match(resolver, /s\.blocked=1/);
  assert.doesNotMatch(resolver, /FROM study_profile_buddies/);
});

test("buddy-visible Study Profile fields also require the owner's directional Phase 11 sharing", () => {
  const service = read("lib/profile/study-profile.ts");
  const resolver = service.match(/async function relationshipForViewer[\s\S]*?\n}\n\nasync function acceptedStudyBuddyIds/)?.[0] ?? "";
  assert.match(resolver, /LEFT JOIN study_buddy_sharing sh ON sh\.relationship_id=r\.id AND sh\.owner_user_id=\?1/);
  assert.match(resolver, /COALESCE\(sh\.share_profile,0\) AS share_profile/);
  assert.match(resolver, /COALESCE\(sh\.share_progress,0\) AS share_progress/);
  assert.match(resolver, /COALESCE\(sh\.share_streak,0\) AS share_streak/);
  assert.match(service, /settings\.profileVisibility === "buddies" && !access\.shareProfile/);
  assert.match(service, /settings\.progressVisibility !== "buddies" \|\| access\.shareProgress/);
  assert.match(service, /settings\.streakVisibility !== "buddies" \|\| access\.shareStreak/);
});

test("legacy Phase 10 ACL rows cannot create new buddy access without acceptance", () => {
  const service = read("lib/profile/study-profile.ts");
  const grant = service.match(/export async function grantStudyProfileBuddy[\s\S]*?\n}\n\nexport async function revokeStudyProfileBuddy/)?.[0] ?? "";
  assert.match(grant, /FROM study_buddy_relationships r/);
  assert.match(grant, /r\.status='accepted'/);
  assert.doesNotMatch(grant, /INSERT OR IGNORE INTO study_profile_buddies/);
  assert.match(grant, /Accept the Study Buddy request before buddy-visible profile access is available/);
});

test("owner Study Profile buddy list is derived from accepted unblocked Phase 11 relationships", () => {
  const service = read("lib/profile/study-profile.ts");
  const acceptedList = service.match(/async function acceptedStudyBuddyIds[\s\S]*?\n}\n\nexport async function getOwnerStudyProfileSettings/)?.[0] ?? "";
  assert.match(acceptedList, /FROM study_buddy_relationships r/);
  assert.match(acceptedList, /r\.status='accepted'/);
  assert.match(acceptedList, /NOT EXISTS/);
  assert.match(acceptedList, /study_buddy_safety/);
});
